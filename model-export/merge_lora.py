"""
Bhasha — Merge a trained LoRA adapter into the base IndicTrans2 model
======================================================================
After `finetune_lora.py` produces an adapter under `lora-adapters/<lang>/`,
this script:
  1. Loads the base en-indic model
  2. Applies the LoRA adapter
  3. Calls peft's `merge_and_unload()` to fold the LoRA weights into the
     base linear layers (no runtime dependency on peft after this)
  4. Re-exports a fresh ONNX pair under `onnx/en-indic-<lang>/`
  5. Quantization + bundle copy can then run as usual

Usage:
    python merge_lora.py --lang lus_Latn
    python merge_lora.py --lang kha_Latn
    python merge_lora.py --lang grt_Latn
"""

import argparse
import gc
import os
import sys
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("MKL_NUM_THREADS", "2")

import torch

torch.set_num_threads(2)
torch.set_grad_enabled(False)

ROOT = Path(__file__).parent
BASE_MODEL_DIR = ROOT / "models" / "en-indic"
ADAPTER_DIR = ROOT / "lora-adapters"
MERGED_DIR = ROOT / "models-merged"


def merge(lang: str):
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    try:
        from peft import PeftModel
    except ImportError:
        print("ERROR: peft not installed. Run: pip install peft==0.11.1")
        sys.exit(1)

    adapter_path = ADAPTER_DIR / lang
    if not adapter_path.exists():
        print(f"ERROR: adapter not found at {adapter_path}")
        print(f"       Run: python finetune_lora.py --lang {lang}")
        sys.exit(1)

    print(f"==> Merging LoRA for {lang}")
    print(f"    base:    {BASE_MODEL_DIR}")
    print(f"    adapter: {adapter_path}")

    tokenizer = AutoTokenizer.from_pretrained(str(BASE_MODEL_DIR), trust_remote_code=True)
    base = AutoModelForSeq2SeqLM.from_pretrained(
        str(BASE_MODEL_DIR),
        trust_remote_code=True,
        low_cpu_mem_usage=True,
        torch_dtype=torch.float32,
    )

    print("    attaching adapter...")
    merged = PeftModel.from_pretrained(base, str(adapter_path))

    print("    merge_and_unload()...")
    merged = merged.merge_and_unload()

    out_dir = MERGED_DIR / f"en-{lang}"
    out_dir.mkdir(parents=True, exist_ok=True)
    merged.save_pretrained(str(out_dir), safe_serialization=True)
    tokenizer.save_pretrained(str(out_dir))
    print(f"✅  Merged model saved → {out_dir}")
    print(f"    Next: python export_onnx.py --model en-{lang}")
    print(f"          python quantize_onnx.py --model en-{lang}")

    del base, merged
    gc.collect()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", required=True, choices=["lus_Latn", "kha_Latn", "grt_Latn"])
    args = parser.parse_args()
    merge(args.lang)


if __name__ == "__main__":
    main()
