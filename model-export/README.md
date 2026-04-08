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
