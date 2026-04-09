#!/usr/bin/env bash
# Bhasha — Create empty placeholder model files so Metro can bundle the app
# even before the real ONNX models have been built.
#
# WHY: app/src/models/bundledAssets.ts uses `require('.../encoder_model_int8.onnx')`
# at module load time. Metro resolves these requires at bundle time, so the files
# must exist at that path. The real .onnx files are 70-200 MB each (built by the
# Python pipeline) and exceed GitHub's 100 MB per-file limit, so they're gitignored.
# This script creates 0-byte stubs that satisfy the bundler.
#
# After running this, run the real pipeline to overwrite the stubs with weights:
#   cd model-export && ./run_pipeline.sh

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSETS="$ROOT/app/assets/models"

DIRECTIONS=(en-indic indic-en indic-indic en-lus_Latn en-kha_Latn)
ONNX_FILES=(encoder_model_int8.onnx decoder_model_int8.onnx tokenizer.onnx detokenizer.onnx)

for dir in "${DIRECTIONS[@]}"; do
  mkdir -p "$ASSETS/$dir"
  for f in "${ONNX_FILES[@]}"; do
    target="$ASSETS/$dir/$f"
    if [[ ! -s "$target" ]]; then
      : > "$target"
      echo "  stub  $dir/$f"
    fi
  done
  # tokens.json must be valid JSON or `require()` chokes at bundle time;
  # ship a minimal stub that the JS layer can detect and treat as "no-op".
  tokens="$ASSETS/$dir/tokens.json"
  if [[ ! -s "$tokens" ]]; then
    echo '{"specials":{"bos":0,"pad":1,"eos":2,"unk":3},"decoder_start_token_id":2,"src_lang_ids":{}}' > "$tokens"
    echo "  stub  $dir/tokens.json"
  fi
done

# ─── TTS voice packs ─────────────────────────────────────────────────────────
# Piper VITS models for English and Nepali. 60 MB + 26 MB, gitignored.
# JSON configs are inlined in src/models/bundledTTS.ts so only the ONNX
# files need to be present on disk.

TTS="$ROOT/app/assets/tts"
declare -A TTS_URLS=(
  ["eng_Latn/model.onnx"]="https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/low/en_US-amy-low.onnx"
  ["npi_Deva/model.onnx"]="https://huggingface.co/rhasspy/piper-voices/resolve/main/ne/ne_NP/google/x_low/ne_NP-google-x_low.onnx"
)

for rel in "${!TTS_URLS[@]}"; do
  target="$TTS/$rel"
  mkdir -p "$(dirname "$target")"
  if [[ ! -s "$target" ]]; then
    url="${TTS_URLS[$rel]}"
    echo "  downloading tts/$rel …"
    curl -fsSL "$url" -o "$target"
    echo "  done  tts/$rel ($(du -sh "$target" | cut -f1))"
  else
    echo "  exists tts/$rel"
  fi
done

echo ""
echo "✅  All assets ready. Now run the real model pipeline if needed:"
echo "    cd model-export && ./run_pipeline.sh"
