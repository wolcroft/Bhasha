#!/usr/bin/env bash
# Bhasha — Master pipeline runner with OOM-safe sequencing.
#
# Each model is exported in a *separate Python process* so PyTorch's
# weight tensors are fully released back to the OS between runs. This
# is the difference between "works on 8 GB RAM" and "swap-thrashes".
#
# Order of operations:
#   1. en-indic   (200M, ~1.2 GB peak RAM during export)
#   2. indic-en   (200M, ~1.2 GB peak RAM)
#   3. indic-indic (320M, ~2.0 GB peak — biggest, run last)
# After all exports succeed, quantize and copy in one shot.
#
# Pass --skip-indic-indic if you want to bail out before the heaviest model.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -d "bhasha-models" ]]; then
  echo "ERROR: venv not found. Run ./setup_env.sh first."
  exit 1
fi

source bhasha-models/bin/activate

DIRECTIONS=("en-indic" "indic-en" "indic-indic")
if [[ "${1:-}" == "--skip-indic-indic" ]]; then
  DIRECTIONS=("en-indic" "indic-en")
  echo "==> Skipping indic-indic (320M) per --skip-indic-indic flag"
fi

# ─── 1. Download (idempotent — snapshot_download skips files already cached) ──
echo ""
echo "════════════════════════════════════════════════════"
echo " STAGE 1: Download IndicTrans2 weights"
echo "════════════════════════════════════════════════════"
for dir in "${DIRECTIONS[@]}"; do
  if [[ ! -d "models/$dir" ]]; then
    echo "  → downloading $dir"
    python download_models.py "$dir"
  else
    echo "  → $dir already cached"
  fi
done

# ─── 2. Export each direction in a fresh subprocess ───────────────────────────
echo ""
echo "════════════════════════════════════════════════════"
echo " STAGE 2: Export to ONNX (one subprocess per model)"
echo "════════════════════════════════════════════════════"
for dir in "${DIRECTIONS[@]}"; do
  if [[ -f "onnx/$dir/encoder_model.onnx" && -f "onnx/$dir/decoder_model.onnx" ]]; then
    echo "  → $dir already exported, skipping"
    continue
  fi
  echo ""
  echo "  ──── exporting $dir ────"
  python export_onnx.py --model "$dir"
  # Aggressive sleep so the OS can reclaim freed pages before the next run
  sleep 2
done

# ─── 3. Quantize ──────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════"
echo " STAGE 3: INT8 quantization"
echo "════════════════════════════════════════════════════"
for dir in "${DIRECTIONS[@]}"; do
  python quantize_onnx.py --model "$dir"
done

# ─── 4. Copy into the app's bundled-asset slot ────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════"
echo " STAGE 4: Copy bundled assets into app/"
echo "════════════════════════════════════════════════════"
python copy_to_app.py "${DIRECTIONS[@]}"

echo ""
echo "✅  Pipeline complete."
echo "    Next: cd ../app && npx expo prebuild && npx expo run:ios"
