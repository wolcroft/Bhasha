"""
Bhasha — Copy quantized models into the React Native app's bundled-asset slot.

Reads from:
    onnx-quantized/<direction>/encoder_model_int8.onnx
    onnx-quantized/<direction>/decoder_model_int8.onnx
    onnx-quantized/<direction>/tokenizer.onnx     (built by build_tokenizer_onnx.py)
    onnx-quantized/<direction>/detokenizer.onnx   (built by build_tokenizer_onnx.py)

Writes to:
    ../app/assets/models/<direction>/{encoder,decoder}_model_int8.onnx
    ../app/assets/models/<direction>/{tokenizer,detokenizer}.onnx

The tokenizer/detokenizer ONNX graphs use onnxruntime-extensions custom ops
(SentencepieceTokenizer / SentencepieceDecoder), which means the React Native
app must have `onnxruntimeExtensionsEnabled: "true"` in its package.json so
the matching native library is linked.

After running this:
    cd ../app
    npx expo prebuild   # Re-link assets into native projects
"""

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).parent
QUANTIZED_DIR = ROOT / "onnx-quantized"
APP_ASSETS = ROOT.parent / "app" / "assets" / "models"

DIRECTIONS = ["en-indic", "indic-en", "indic-indic", "en-lus_Latn", "en-kha_Latn"]
ASSET_FILES = (
    "encoder_model_int8.onnx",
    "decoder_model_int8.onnx",
    "tokenizer.onnx",
    "detokenizer.onnx",
    "tokens.json",
)


def copy_one(direction: str) -> bool:
    src_dir = QUANTIZED_DIR / direction
    dst_dir = APP_ASSETS / direction
    dst_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n==> {direction}")

    for fname in ASSET_FILES:
        src = src_dir / fname
        if not src.exists():
            print(f"  [MISS] {src} — run the relevant build step first")
            return False
        shutil.copy2(src, dst_dir / fname)
        print(f"  copied {fname}  ({src.stat().st_size / 1e6:.2f} MB)")

    # Encoder/decoder models can have an external-data sidecar (>2 GB protobuf
    # workaround). Copy it alongside if present.
    for fname in ("encoder_model_int8.onnx", "decoder_model_int8.onnx"):
        sidecar = src_dir / f"{fname}.data"
        if sidecar.exists():
            shutil.copy2(sidecar, dst_dir / sidecar.name)
            print(f"  copied {sidecar.name}  ({sidecar.stat().st_size / 1e6:.2f} MB)")

    return True


def main() -> None:
    if not QUANTIZED_DIR.exists():
        print("ERROR: onnx-quantized/ not found.")
        print("       Run export_onnx.py + quantize_onnx.py + build_tokenizer_onnx.py first.")
        sys.exit(1)

    targets = sys.argv[1:] if len(sys.argv) > 1 else DIRECTIONS
    success, failure = [], []

    for direction in targets:
        (success if copy_one(direction) else failure).append(direction)

    print(f"\nCopied: {success}")
    if failure:
        print(f"Failed: {failure}")
    print("\nNext: cd ../app && npx expo prebuild")


if __name__ == "__main__":
    main()
