"""
Bhasha — LoRA fine-tuning for Tier-2 Northeast languages
=========================================================
IndicTrans2's distilled-200M base model does not natively support
Mizo (lus_Latn), Khasi (kha_Latn), or Garo (grt_Latn). This script
fine-tunes a small LoRA adapter on top of the en-indic checkpoint
using parallel English↔target sentence pairs.

Why LoRA?
  • Trainable params drop from 200M to ~2-5M (rank 16, attention only)
  • Fits in 8 GB RAM with gradient accumulation + small batch
  • Adapters are 10-20 MB on disk → cheap to bundle per language

Data format:
  Drop JSONL files at `data/<lang>/train.jsonl` with one example per line:
    {"src": "Hello, how are you?", "tgt": "Khuallian, i dam em?"}
    {"src": "I went to the market.", "tgt": "Bazar-ah ka kal."}
  src is always English (eng_Latn). tgt is the target language.
  Recommended sources: FLORES-200, Bible parallel corpora, AI4Bharat BPCC.

OOM-safe defaults for 8 GB Mac:
  • per_device_train_batch_size = 1
  • gradient_accumulation_steps = 16   (effective batch = 16)
  • LoRA rank 16, alpha 32, on q_proj/v_proj only
  • fp32 (MPS bf16/fp16 still flaky for IndicTrans2's custom layers)
  • max_seq_length = 128 (NE training sentences are usually short)
  • Gradient checkpointing enabled
  • Model loaded with low_cpu_mem_usage=True

Usage:
    python finetune_lora.py --lang lus_Latn --epochs 3
    python finetune_lora.py --lang kha_Latn --epochs 3
    python finetune_lora.py --lang grt_Latn --epochs 3

After training, the LoRA adapter is exported under
    ./lora-adapters/<lang>/   (~15 MB each)
ready to be merged into the base model and re-exported via export_onnx.py.
"""

import argparse
import gc
import json
import os
import sys
from pathlib import Path

# Memory hygiene before torch import — see export_onnx.py for rationale
os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("MKL_NUM_THREADS", "2")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import torch
from torch.utils.data import Dataset

torch.set_num_threads(2)

ROOT = Path(__file__).parent
BASE_MODEL_DIR = ROOT / "models" / "en-indic"
DATA_DIR = ROOT / "data"
ADAPTER_DIR = ROOT / "lora-adapters"

# Tier-2 NE language codes that this script supports.
TIER2_LANGS = {
    "lus_Latn": "Mizo",
    "kha_Latn": "Khasi",
    "grt_Latn": "Garo",
}


# ─── Dataset ──────────────────────────────────────────────────────────────────

class ParallelJsonlDataset(Dataset):
    """Loads {"src": ..., "tgt": ...} JSONL pairs and tokenises lazily."""

    def __init__(self, path: Path, tokenizer, src_lang: str, tgt_lang: str, max_len: int = 128):
        if not path.exists():
            raise FileNotFoundError(f"Training data not found: {path}")
        with open(path, "r", encoding="utf-8") as f:
            self.examples = [json.loads(line) for line in f if line.strip()]
        self.tokenizer = tokenizer
        self.src_lang = src_lang
        self.tgt_lang = tgt_lang
        self.max_len = max_len
        print(f"  loaded {len(self.examples)} pairs from {path.name}")

    def __len__(self) -> int:
        return len(self.examples)

    def __getitem__(self, idx: int) -> dict:
        ex = self.examples[idx]
        # IndicTrans2 expects [src_lang_id] + tokens + [eos]
        # The HF tokenizer for IndicTrans2 handles tag injection when given
        # `src_lang` / `tgt_lang` kwargs.
        self.tokenizer.src_lang = self.src_lang
        self.tokenizer.tgt_lang = self.tgt_lang
        encoded = self.tokenizer(
            ex["src"],
            text_target=ex["tgt"],
            max_length=self.max_len,
            truncation=True,
            padding="max_length",
            return_tensors="pt",
        )
        return {
            "input_ids":      encoded["input_ids"].squeeze(0),
            "attention_mask": encoded["attention_mask"].squeeze(0),
            "labels":         encoded["labels"].squeeze(0),
        }


# ─── Training ─────────────────────────────────────────────────────────────────

def train(lang: str, epochs: int, lr: float, lora_rank: int):
    if lang not in TIER2_LANGS:
        print(f"ERROR: --lang must be one of {list(TIER2_LANGS.keys())}")
        sys.exit(1)

    print(f"\n==> Fine-tuning {TIER2_LANGS[lang]} ({lang})")

    # Lazy imports — peft/transformers are heavy
    from transformers import (
        AutoModelForSeq2SeqLM,
        AutoTokenizer,
        Seq2SeqTrainer,
        Seq2SeqTrainingArguments,
        DataCollatorForSeq2Seq,
    )
    try:
        from peft import LoraConfig, get_peft_model, TaskType
    except ImportError:
        print("ERROR: peft not installed. Run: pip install peft==0.11.1")
        sys.exit(1)

    if not BASE_MODEL_DIR.exists():
        print(f"ERROR: base model not found at {BASE_MODEL_DIR}")
        print(f"       Run: python download_models.py en-indic")
        sys.exit(1)

    tokenizer = AutoTokenizer.from_pretrained(str(BASE_MODEL_DIR), trust_remote_code=True)

    print("    loading base model (low_cpu_mem_usage=True)...")
    model = AutoModelForSeq2SeqLM.from_pretrained(
        str(BASE_MODEL_DIR),
        trust_remote_code=True,
        low_cpu_mem_usage=True,
        torch_dtype=torch.float32,
    )

    # Freeze the entire base model — only LoRA adapters will receive grads.
    for p in model.parameters():
        p.requires_grad = False

    # Gradient checkpointing reduces activation memory at the cost of an
    # extra forward pass per step. Worth it on 8 GB RAM.
    model.gradient_checkpointing_enable()
    model.enable_input_require_grads()

    # LoRA config — only attach to attention projections to keep param count low.
    lora_config = LoraConfig(
        task_type=TaskType.SEQ_2_SEQ_LM,
        r=lora_rank,
        lora_alpha=lora_rank * 2,
        lora_dropout=0.05,
        bias="none",
        target_modules=["q_proj", "v_proj"],
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    train_path = DATA_DIR / lang / "train.jsonl"
    train_set = ParallelJsonlDataset(train_path, tokenizer, "eng_Latn", lang)

    eval_path = DATA_DIR / lang / "dev.jsonl"
    eval_set = (
        ParallelJsonlDataset(eval_path, tokenizer, "eng_Latn", lang)
        if eval_path.exists() else None
    )

    collator = DataCollatorForSeq2Seq(tokenizer, model=model, padding=True)

    output_dir = ADAPTER_DIR / lang
    output_dir.mkdir(parents=True, exist_ok=True)

    args = Seq2SeqTrainingArguments(
        output_dir=str(output_dir),
        num_train_epochs=epochs,
        # OOM-safe knobs for 8 GB RAM:
        per_device_train_batch_size=1,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=16,
        gradient_checkpointing=True,
        learning_rate=lr,
        warmup_ratio=0.1,
        weight_decay=0.01,
        logging_steps=10,
        save_steps=200,
        save_total_limit=2,
        eval_strategy="steps" if eval_set else "no",
        eval_steps=200 if eval_set else None,
        predict_with_generate=False,  # generation balloons RAM — eval on loss
        fp16=False,
        bf16=False,
        dataloader_num_workers=0,     # No worker subprocesses → less RAM
        report_to="none",
        remove_unused_columns=False,
        label_names=["labels"],
    )

    trainer = Seq2SeqTrainer(
        model=model,
        args=args,
        train_dataset=train_set,
        eval_dataset=eval_set,
        data_collator=collator,
        tokenizer=tokenizer,
    )

    print(f"    starting training: {epochs} epochs, effective batch=16")
    trainer.train()

    # Save just the LoRA adapter (small) — not the full merged model.
    model.save_pretrained(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))
    print(f"\n✅  LoRA adapter saved → {output_dir}")
    print(f"    Next: merge with base + re-export ONNX via merge_lora.py")

    del model, trainer
    gc.collect()


def main():
    parser = argparse.ArgumentParser(description="LoRA fine-tune IndicTrans2 for a Tier-2 NE language")
    parser.add_argument("--lang", required=True, choices=list(TIER2_LANGS.keys()))
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--rank", type=int, default=16)
    args = parser.parse_args()

    train(args.lang, args.epochs, args.lr, args.rank)


if __name__ == "__main__":
    main()
