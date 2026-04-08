"""
Bhasha — ONNX INT8 Quantization
=================================
Quantizes exported encoder/decoder ONNX models to INT8 (QDQ format).
Targets mobile CPU inference — reduces model size ~4x with minimal accuracy loss.

Usage:
    python quantize_onnx.py --model en-indic
    python quantize_onnx.py --model indic-en
    python quantize_onnx.py --model indic-indic
    python quantize_onnx.py --all
"""

import argparse
from pathlib import Path

import gc

from onnxruntime.quantization import quantize_dynamic, QuantType
from onnxruntime.quantization.shape_inference import quant_pre_process

ONNX_DIR = Path(__file__).parent / "onnx"
QUANTIZED_DIR = Path(__file__).parent / "onnx-quantized"

MODEL_NAMES = ["en-indic", "indic-en", "indic-indic"]
MODEL_FILES = ["encoder_model.onnx", "decoder_model.onnx"]


def quantize_model(model_name: str) -> None:
    src_dir = ONNX_DIR / model_name
    dst_dir = QUANTIZED_DIR / model_name
    dst_dir.mkdir(parents=True, exist_ok=True)

    for filename in MODEL_FILES:
        src_path = src_dir / filename
        if not src_path.exists():
            print(f"  [SKIP] {src_path} not found — run export_onnx.py first")
            continue

        stem = Path(filename).stem  # "encoder_model" / "decoder_model"

        # Shape inference pre-process (improves quantization quality)
        preprocessed = dst_dir / f"{stem}_preprocessed.onnx"
        print(f"  [prep] shape inference on {filename} ...")
        quant_pre_process(str(src_path), str(preprocessed), skip_symbolic_shape=True)

        # Dynamic INT8 quantization (weights + activations where possible)
        dst_path = dst_dir / f"{stem}_int8.onnx"
        print(f"  [quant] quantizing to INT8 → {dst_path.name} ...")
        quantize_dynamic(
            str(preprocessed),
            str(dst_path),
            weight_type=QuantType.QInt8,
        )

        src_mb = src_path.stat().st_size / 1e6
        dst_mb = dst_path.stat().st_size / 1e6
        ratio = src_mb / dst_mb if dst_mb > 0 else 0
        print(f"  [done] {src_mb:.1f} MB → {dst_mb:.1f} MB  ({ratio:.1f}x smaller)")

        # Clean up preprocessed temp file + free RAM before next file
        preprocessed.unlink(missing_ok=True)
        gc.collect()


def main():
    parser = argparse.ArgumentParser(description="Quantize IndicTrans2 ONNX models to INT8")
    parser.add_argument("--model", choices=MODEL_NAMES, help="Model to quantize")
    parser.add_argument("--all", action="store_true", help="Quantize all models")
    args = parser.parse_args()

    if args.all:
        targets = MODEL_NAMES
    elif args.model:
        targets = [args.model]
    else:
        parser.print_help()
        return

    for model_name in targets:
        print(f"\n==> Quantizing {model_name}")
        quantize_model(model_name)

    print(f"\n✅  Quantized models saved to {QUANTIZED_DIR}")


if __name__ == "__main__":
    main()
