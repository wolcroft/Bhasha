# Bhasha — Model Export Pipeline

Run these steps in order on your Mac M2 Pro before starting React Native development.

## Step 1 — Set up Python environment

```bash
cd model-export
chmod +x setup_env.sh
./setup_env.sh
source bhasha-models/bin/activate
```

## Step 2 — Download models from HuggingFace

> ⚠️ **Gated repos.** As of 2026, all `ai4bharat/indictrans2-*` checkpoints are
> gated. You must (a) have a HuggingFace account, (b) request access on each
> repo page, and (c) export your token before running the downloader:
>
> 1. Visit each repo and click **"Agree and access repository"**:
>    - https://huggingface.co/ai4bharat/indictrans2-en-indic-dist-200M
>    - https://huggingface.co/ai4bharat/indictrans2-indic-en-dist-200M
>    - https://huggingface.co/ai4bharat/indictrans2-indic-indic-dist-320M
> 2. Generate a read token at https://huggingface.co/settings/tokens
> 3. Export it before running the downloader:
>    ```bash
>    export HF_TOKEN=hf_xxx...
>    ```
>
> Approval is usually instant (auto-accept) but can take a few hours during
> business days. Without it, the downloader fails with `GatedRepoError: 403`.

Downloads ~1.5GB per model direction (3 directions total):

```bash
# Download all three IndicTrans2 distilled models
python download_models.py

# Or download selectively:
python download_models.py en-indic      # English → Indic only
python download_models.py indic-en      # Indic → English only
python download_models.py indic-indic   # Indic ↔ Indic only
```

## Step 3 — Export to ONNX

Splits encoder and decoder into separate ONNX graphs (required for mobile inference):

```bash
python export_onnx.py --model en-indic
python export_onnx.py --model indic-en
python export_onnx.py --model indic-indic
```

Expected output per model:
- `onnx/<model>/encoder_model.onnx`
- `onnx/<model>/decoder_model.onnx`

Export takes ~5-15 minutes per model on M2 Pro CPU.

## Step 4 — Quantize to INT8

Reduces model size ~4x with minimal accuracy loss:

```bash
python quantize_onnx.py --all
```

Output:
- `onnx-quantized/<model>/encoder_model_int8.onnx`
- `onnx-quantized/<model>/decoder_model_int8.onnx`

## Step 5 — Benchmark

Validates accuracy and measures latency/memory on CPU (to simulate phone ARM):

```bash
python benchmark.py --model en-indic --quantized
python benchmark.py --all --quantized
```

Target: `<500ms` per sentence on M2 CPU = ~1s on a flagship phone.

## File structure after all steps

```
model-export/
├── bhasha-models/          # Python venv (gitignored)
├── models/                 # Downloaded HuggingFace models (gitignored)
│   ├── en-indic/
│   ├── indic-en/
│   └── indic-indic/
├── onnx/                   # FP32 ONNX exports (gitignored)
│   ├── en-indic/
│   ├── indic-en/
│   └── indic-indic/
├── onnx-quantized/         # INT8 quantized models — copy these to RN app
│   ├── en-indic/
│   ├── indic-en/
│   └── indic-indic/
├── setup_env.sh
├── download_models.py
├── export_onnx.py
├── quantize_onnx.py
└── benchmark.py
```

## Troubleshooting

**`TypeError` during ONNX export** — IndicTrans2 uses a custom `IndicTransModel` class.
The export script wraps encoder/decoder separately to work around this. If you see
errors about dynamic control flow, try adding `torch.jit.script` wrappers around
problem layers, or pin `torch==2.2.x`.

**`AttributeError: 'IndicTransModel' has no attribute 'encoder'`** — Some checkpoint
versions use `model.encoder` vs `encoder`. Check the model's `config.json` and update
the `EncoderWrapper`/`DecoderWrapper` attribute paths accordingly.

**OOM during export** — 200M model needs ~4-6GB RAM. Close other apps or try
`--device cpu` with swap space available.

## Tier-2 LoRA pipeline (Nagamese + Khasi)

Nagamese (`lus_Latn` slot) and Khasi (`kha_Latn`) are not supported by the
IndicTrans2 distilled base model out of the box, but their language-tag
embeddings *do* exist in the en-indic vocab (ids 32162 and 32163). LoRA
fine-tuning on a small parallel corpus is enough to make them usable. Garo
(`grt_Latn`) is not in the dict at all and was dropped from v1.

**Note on `lus_Latn`:** In FLORES-200 this slot was originally reserved for
Mizo (Lushai). We repurpose it for Nagamese — the Assamese-based creole
lingua franca of Nagaland (~2M speakers) — because Nagamese has higher reach
and Mizo's FLORES vocabulary slot is the only available Latin-script vacancy.
Mizo is therefore listed as Tier-3 ("coming soon") in the app until
IndicTrans2 adds a dedicated slot or a second Latin-script vacancy is found.

### Step A — Get parallel data

Realistic sources (do your own license check before bundling derivatives):

| Language | Source | Approx size |
|---|---|---|
| Nagamese | Community-collected Nagamese↔English sentence pairs | ~7,500 pairs |
| Nagamese | OPUS corpora filtered for Nagaland/Nagamese | small supplement |
| Khasi | `christos-c/bible-corpus` on HuggingFace | ~30k verses |
| Khasi | Khasi Hills Bible Society | manual scrape, verse-aligned |

Confirmed-empty (skip these — no Nagamese/Khasi coverage):
- AI4Bharat BPCC
- WMT24 LR-Indic

### Step B — Convert to JSONL

`prepare_lora_data.py` accepts TSV, JSONL, or two parallel plain-text files
and produces `data/<lang>/{train,dev}.jsonl`. It filters out misaligned
pairs by length ratio and dedupes.

```bash
# TSV of English↔Nagamese pairs:
python prepare_lora_data.py --lang lus_Latn --tsv ./raw/nagamese_pairs.tsv

# Or two paired plain-text files:
python prepare_lora_data.py --lang kha_Latn \
    --src-file ./raw/khasi/english.txt \
    --tgt-file ./raw/khasi/khasi.txt
```

### Step C — Fine-tune

```bash
python finetune_lora.py --lang lus_Latn --epochs 3
python finetune_lora.py --lang kha_Latn --epochs 3
```

LoRA defaults are tuned for an 8 GB Mac: rank 16 on q_proj/v_proj, batch=1
with grad accum 16, fp32, gradient checkpointing. Adapter lands at
`lora-adapters/<lang>/` (~15 MB).

### Step D — Merge + re-export

```bash
python merge_lora.py --lang lus_Latn
python export_onnx.py --model en-lus_Latn       # uses models-merged/en-lus_Latn
python quantize_onnx.py --model en-lus_Latn
python build_tokenizer_onnx.py --direction en-lus_Latn  # if needed
python copy_to_app.py en-lus_Latn
```

The merged model uses the same dict.SRC.json/dict.TGT.json as the en-indic
base, so the existing `tokenizer.onnx` for `en-indic` works as-is — no need
to rebuild the tokenizer graph.
