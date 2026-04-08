"""
Bhasha — IndicTrans2 Custom ONNX Exporter
==========================================
Standard `optimum-cli` export fails for IndicTrans2's custom architecture.
This script does a manual split encoder/decoder export via torch.onnx.export().

Usage:
    python export_onnx.py --model en-indic
    python export_onnx.py --model indic-en
    python export_onnx.py --model indic-indic

Output:
    ./onnx/<model-name>/encoder_model.onnx
    ./onnx/<model-name>/decoder_model.onnx
    ./onnx/<model-name>/decoder_with_past_model.onnx  (for KV-cache inference)
"""

import argparse
import gc
import os
import sys
from pathlib import Path

# ─── Memory hygiene for 8 GB Mac ────────────────────────────────────────────
# Limit thread workers and disable MKL parallel scratch space *before*
# importing torch — once torch boots, these env vars are fixed for the run.
os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("MKL_NUM_THREADS", "2")
os.environ.setdefault("PYTORCH_MPS_HIGH_WATERMARK_RATIO", "0.0")

import torch
import torch.nn as nn
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

torch.set_num_threads(2)
torch.set_grad_enabled(False)  # No autograd buffers needed for export

MODELS_DIR = Path(__file__).parent / "models"
ONNX_DIR = Path(__file__).parent / "onnx"

MODEL_DIRS = {
    "en-indic": MODELS_DIR / "en-indic",
    "indic-en": MODELS_DIR / "indic-en",
    "indic-indic": MODELS_DIR / "indic-indic",
}

# ─── Encoder wrapper ──────────────────────────────────────────────────────────

class EncoderWrapper(nn.Module):
    """Wraps the seq2seq encoder to produce last_hidden_state + attention_mask."""

    def __init__(self, encoder):
        super().__init__()
        self.encoder = encoder

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor):
        output = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        return output.last_hidden_state


# ─── Decoder wrapper ──────────────────────────────────────────────────────────

class DecoderWrapper(nn.Module):
    """
    Wraps the seq2seq decoder for a single auto-regressive step.
    Accepts encoder hidden states + the current decoder input token.
    Returns next-token logits.
    """

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(
        self,
        input_ids: torch.Tensor,           # (batch, 1)
        encoder_hidden_states: torch.Tensor,  # (batch, src_len, hidden)
        encoder_attention_mask: torch.Tensor, # (batch, src_len)
    ):
        output = self.model(
            decoder_input_ids=input_ids,
            encoder_outputs=(encoder_hidden_states,),
            attention_mask=encoder_attention_mask,
        )
        return output.logits


# ─── Export helpers ───────────────────────────────────────────────────────────

def _dummy_inputs(tokenizer, device: torch.device):
    sample = "This is a test sentence for export validation."
    enc = tokenizer(sample, return_tensors="pt", padding=True).to(device)
    return enc["input_ids"], enc["attention_mask"]


def export_encoder(model, tokenizer, out_dir: Path, device: torch.device):
    print("  [encoder] wrapping...")
    wrapper = EncoderWrapper(model.model.encoder).eval().to(device)

    input_ids, attention_mask = _dummy_inputs(tokenizer, device)

    print("  [encoder] exporting...")
    out_path = out_dir / "encoder_model.onnx"
    torch.onnx.export(
        wrapper,
        (input_ids, attention_mask),
        str(out_path),
        input_names=["input_ids", "attention_mask"],
        output_names=["last_hidden_state"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "sequence_length"},
            "attention_mask": {0: "batch_size", 1: "sequence_length"},
            "last_hidden_state": {0: "batch_size", 1: "sequence_length"},
        },
        opset_version=17,
        do_constant_folding=True,
    )
    print(f"  [encoder] saved → {out_path}  ({out_path.stat().st_size / 1e6:.1f} MB)")
    return out_path


def export_decoder(model, tokenizer, out_dir: Path, device: torch.device):
    print("  [decoder] wrapping...")
    wrapper = DecoderWrapper(model).eval().to(device)

    input_ids, attention_mask = _dummy_inputs(tokenizer, device)

    # Get encoder hidden states for dummy decoder input
    with torch.no_grad():
        enc_out = model.model.encoder(
            input_ids=input_ids, attention_mask=attention_mask
        )
    encoder_hidden_states = enc_out.last_hidden_state  # (1, src_len, hidden)
    decoder_input_ids = torch.tensor([[model.config.decoder_start_token_id]], device=device)

    print("  [decoder] exporting...")
    out_path = out_dir / "decoder_model.onnx"
    torch.onnx.export(
        wrapper,
        (decoder_input_ids, encoder_hidden_states, attention_mask),
        str(out_path),
        input_names=["input_ids", "encoder_hidden_states", "encoder_attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "decoder_sequence_length"},
            "encoder_hidden_states": {0: "batch_size", 1: "encoder_sequence_length"},
            "encoder_attention_mask": {0: "batch_size", 1: "encoder_sequence_length"},
            "logits": {0: "batch_size", 1: "decoder_sequence_length"},
        },
        opset_version=17,
        do_constant_folding=True,
    )
    print(f"  [decoder] saved → {out_path}  ({out_path.stat().st_size / 1e6:.1f} MB)")
    return out_path


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Export IndicTrans2 to ONNX")
    parser.add_argument(
        "--model",
        choices=list(MODEL_DIRS.keys()),
        required=True,
        help="Which model direction to export",
    )
    parser.add_argument(
        "--device",
        choices=["cpu", "mps"],
        default="cpu",
        help="Export on CPU (recommended; MPS still has ONNX export limitations)",
    )
    args = parser.parse_args()

    model_path = MODEL_DIRS[args.model]
    if not model_path.exists():
        print(f"ERROR: Model not found at {model_path}")
        print(f"       Run: python download_models.py {args.model}")
        sys.exit(1)

    out_dir = ONNX_DIR / args.model
    out_dir.mkdir(parents=True, exist_ok=True)

    device = torch.device(args.device)
    print(f"\n==> Exporting {args.model} on {device}")
    print(f"    Loading model from {model_path} ...")

    tokenizer = AutoTokenizer.from_pretrained(str(model_path), trust_remote_code=True)
    # `low_cpu_mem_usage=True` streams weights from disk to the model rather
    # than holding two copies in RAM during init — critical on 8 GB Macs.
    model = AutoModelForSeq2SeqLM.from_pretrained(
        str(model_path),
        trust_remote_code=True,
        low_cpu_mem_usage=True,
        torch_dtype=torch.float32,
    ).eval().to(device)

    print(f"    Model loaded. Parameters: {sum(p.numel() for p in model.parameters()) / 1e6:.1f}M")

    with torch.no_grad():
        export_encoder(model, tokenizer, out_dir, device)
        # Free encoder-export buffers before tracing the decoder
        gc.collect()
        export_decoder(model, tokenizer, out_dir, device)

    # Drop the FP32 model + autograd graphs from RAM before returning
    del model
    gc.collect()

    print(f"\n✅  Export complete → {out_dir}")


if __name__ == "__main__":
    main()
