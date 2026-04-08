"""
Bhasha — ONNX Inference Benchmark
====================================
Validates exported + quantized models and benchmarks latency/memory.
Runs on CPU only (--no-mps) to simulate mobile ARM performance.

Usage:
    python benchmark.py --model en-indic
    python benchmark.py --model en-indic --quantized
    python benchmark.py --all --quantized
"""

import argparse
import time
import gc
from pathlib import Path

import numpy as np
import psutil
import onnxruntime as ort
from transformers import AutoTokenizer

MODELS_DIR = Path(__file__).parent / "models"
ONNX_DIR = Path(__file__).parent / "onnx"
QUANTIZED_DIR = Path(__file__).parent / "onnx-quantized"

MODEL_NAMES = ["en-indic", "indic-en", "indic-indic"]

# Sample sentences for benchmarking
TEST_SENTENCES = {
    "en-indic": [
        "Hello, how are you?",
        "I would like to visit the market tomorrow.",
        "The hospital is located near the central bus station.",
        "Please call the doctor immediately, the patient is not well.",
    ],
    "indic-en": [
        "नमस्ते, आप कैसे हैं?",
        "मैं कल बाज़ार जाना चाहता हूँ।",
        "अस्पताल केंद्रीय बस स्टेशन के पास है।",
        "कृपया डॉक्टर को तुरंत बुलाएं, मरीज़ ठीक नहीं है।",
    ],
    "indic-indic": [
        "নমস্কার, আপনি কেমন আছেন?",
        "আমি আগামীকাল বাজারে যেতে চাই।",
    ],
}

SRC_LANG = {"en-indic": "eng_Latn", "indic-en": "hin_Deva", "indic-indic": "ben_Beng"}
TGT_LANG = {"en-indic": "hin_Deva", "indic-en": "eng_Latn", "indic-indic": "hin_Deva"}


def get_memory_mb() -> float:
    proc = psutil.Process()
    return proc.memory_info().rss / 1e6


def load_sessions(model_name: str, quantized: bool):
    base_dir = QUANTIZED_DIR if quantized else ONNX_DIR
    model_dir = base_dir / model_name

    suffix = "_int8" if quantized else ""
    enc_path = model_dir / f"encoder_model{suffix}.onnx"
    dec_path = model_dir / f"decoder_model{suffix}.onnx"

    if not enc_path.exists() or not dec_path.exists():
        raise FileNotFoundError(
            f"ONNX files not found in {model_dir}. "
            f"Run export_onnx.py {'and quantize_onnx.py ' if not quantized else ''}first."
        )

    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 4  # Simulate 4-core mobile CPU
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

    providers = ["CPUExecutionProvider"]  # CPU only — simulates phone ARM

    enc_session = ort.InferenceSession(str(enc_path), opts, providers=providers)
    dec_session = ort.InferenceSession(str(dec_path), opts, providers=providers)
    return enc_session, dec_session


def greedy_decode(enc_session, dec_session, tokenizer, text: str, src_lang: str, tgt_lang: str, max_len=128):
    tokenizer.src_lang = src_lang
    inputs = tokenizer(text, return_tensors="np", padding=True)
    input_ids = inputs["input_ids"].astype(np.int64)
    attention_mask = inputs["attention_mask"].astype(np.int64)

    # Encode
    encoder_hidden = enc_session.run(
        ["last_hidden_state"],
        {"input_ids": input_ids, "attention_mask": attention_mask},
    )[0]

    # Forced BOS token for target language
    tgt_token_id = tokenizer.convert_tokens_to_ids(tgt_lang)
    decoder_input_ids = np.array([[tgt_token_id]], dtype=np.int64)

    generated = [tgt_token_id]
    for _ in range(max_len):
        logits = dec_session.run(
            ["logits"],
            {
                "input_ids": decoder_input_ids,
                "encoder_hidden_states": encoder_hidden,
                "encoder_attention_mask": attention_mask,
            },
        )[0]

        next_token = int(np.argmax(logits[0, -1, :]))
        generated.append(next_token)

        if next_token == tokenizer.eos_token_id:
            break

        decoder_input_ids = np.concatenate(
            [decoder_input_ids, np.array([[next_token]], dtype=np.int64)], axis=1
        )

    return tokenizer.decode(generated, skip_special_tokens=True)


def benchmark_model(model_name: str, quantized: bool) -> None:
    label = f"{model_name} ({'quantized INT8' if quantized else 'FP32'})"
    print(f"\n{'='*60}")
    print(f"Benchmarking: {label}")
    print(f"{'='*60}")

    tokenizer_path = MODELS_DIR / model_name
    if not tokenizer_path.exists():
        print(f"  [SKIP] Tokenizer not found at {tokenizer_path}")
        return

    tokenizer = AutoTokenizer.from_pretrained(str(tokenizer_path), trust_remote_code=True)

    mem_before = get_memory_mb()
    enc_session, dec_session = load_sessions(model_name, quantized)
    mem_after = get_memory_mb()
    print(f"  Model load memory: {mem_after - mem_before:.1f} MB  (total RSS: {mem_after:.0f} MB)")

    sentences = TEST_SENTENCES.get(model_name, ["Hello world."])
    src_lang = SRC_LANG[model_name]
    tgt_lang = TGT_LANG[model_name]

    latencies = []
    for sentence in sentences:
        start = time.perf_counter()
        translation = greedy_decode(enc_session, dec_session, tokenizer, sentence, src_lang, tgt_lang)
        elapsed_ms = (time.perf_counter() - start) * 1000
        latencies.append(elapsed_ms)

        print(f"\n  src: {sentence}")
        print(f"  tgt: {translation}")
        print(f"  ⏱  {elapsed_ms:.0f} ms")

    mem_peak = get_memory_mb()
    avg_lat = sum(latencies) / len(latencies)
    print(f"\n  Average latency: {avg_lat:.0f} ms")
    print(f"  Peak RSS:        {mem_peak:.0f} MB")
    print(f"\n  Target:  <500ms per sentence on M2 CPU (→ ~1s on flagship phone)")
    print(f"  Status:  {'✅ PASS' if avg_lat < 500 else '⚠️  SLOW — consider smaller model'}")


def main():
    parser = argparse.ArgumentParser(description="Benchmark Bhasha ONNX models")
    parser.add_argument("--model", choices=MODEL_NAMES)
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--quantized", action="store_true", help="Benchmark quantized INT8 models")
    args = parser.parse_args()

    if args.all:
        targets = MODEL_NAMES
    elif args.model:
        targets = [args.model]
    else:
        parser.print_help()
        return

    for model_name in targets:
        benchmark_model(model_name, args.quantized)
        gc.collect()

    print("\n✅  Benchmark complete.")


if __name__ == "__main__":
    main()
