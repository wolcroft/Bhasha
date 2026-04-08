"""
Bhasha — Copy quantized models into the React Native app's bundled-asset slot.

Reads from:
    onnx-quantized/<direction>/encoder_model_int8.onnx
    onnx-quantized/<direction>/decoder_model_int8.onnx
    models/<direction>/  (for vocab.json + merges.txt)

Writes to:
    ../app/assets/models/<direction>/encoder_model_int8.onnx
    ../app/assets/models/<direction>/decoder_model_int8.onnx
    ../app/assets/models/<direction>/vocab.txt   (renamed from vocab.json — Metro
                                                  treats .json as a JS source)
    ../app/assets/models/<direction>/merges.txt

After running this, do:
    cd ../app
    npx expo prebuild   # Re-link assets into native projects
"""

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).parent
QUANTIZED_DIR = ROOT / "onnx-quantized"
MODELS_DIR = ROOT / "models"
APP_ASSETS = ROOT.parent / "app" / "assets" / "models"

DIRECTIONS = ["en-indic", "indic-en", "indic-indic"]


def copy_one(direction: str) -> bool:
    src_quant = QUANTIZED_DIR / direction
    src_tok = MODELS_DIR / direction
    dst = APP_ASSETS / direction
    dst.mkdir(parents=True, exist_ok=True)

    print(f"\n==> {direction}")

    # ONNX files
    for fname in ("encoder_model_int8.onnx", "decoder_model_int8.onnx"):
        src = src_quant / fname
        if not src.exists():
            print(f"  [SKIP] {src} not found — run quantize_onnx.py first")
            return False
        shutil.copy2(src, dst / fname)
        print(f"  copied {fname}  ({src.stat().st_size / 1e6:.1f} MB)")

    # Tokenizer files: vocab.json → vocab.txt (Metro asset workaround)
    vocab_src = src_tok / "vocab.json"
    if not vocab_src.exists():
        # Some HF tokenizers store the vocab inside tokenizer.json or
        # spm.model — we accept either as a fallback.
        for alt in ("tokenizer.json", "spm.model"):
            alt_path = src_tok / alt
            if alt_path.exists():
                vocab_src = alt_path
                break

    if vocab_src.exists():
        shutil.copy2(vocab_src, dst / "vocab.txt")
        print(f"  copied vocab → vocab.txt")
    else:
        print(f"  [SKIP] no vocab file found in {src_tok}")
        return False

    merges_src = src_tok / "merges.txt"
    if merges_src.exists():
        shutil.copy2(merges_src, dst / "merges.txt")
        print(f"  copied merges.txt")
    else:
        # SentencePiece-only tokenizers may not have merges.txt
        # — write an empty stub so the BPE loader has a file to read
        (dst / "merges.txt").write_text("#version: 0.2\n")
        print(f"  [stub] no merges.txt — wrote empty stub")

    return True


def main() -> None:
    if not QUANTIZED_DIR.exists():
        print("ERROR: onnx-quantized/ not found.")
        print("       Run: python export_onnx.py + python quantize_onnx.py first.")
        sys.exit(1)

    targets = sys.argv[1:] if len(sys.argv) > 1 else DIRECTIONS
    success = []
    failure = []

    for direction in targets:
        if direction not in DIRECTIONS:
            print(f"Unknown direction: {direction}")
            continue
        ok = copy_one(direction)
        (success if ok else failure).append(direction)

    print(f"\n✅  Copied: {success}")
    if failure:
        print(f"⚠️  Failed: {failure}")
    print(f"\nNext: cd ../app && npx expo prebuild")


if __name__ == "__main__":
    main()
