# Bundled Model Assets

This directory holds the on-device translation model files. They are bundled
into the app binary and copied to writable storage on first launch.

## Layout

```
assets/models/
├── en-indic/
│   ├── encoder_model_int8.onnx     ← from quantize_onnx.py
│   ├── decoder_model_int8.onnx
│   ├── vocab.json                  ← from downloaded HF tokenizer
│   └── merges.txt
├── indic-en/
│   ├── encoder_model_int8.onnx
│   ├── decoder_model_int8.onnx
│   ├── vocab.json
│   └── merges.txt
└── indic-indic/
    ├── encoder_model_int8.onnx
    ├── decoder_model_int8.onnx
    ├── vocab.json
    └── merges.txt
```

## How models get here

1. Run the Python export pipeline in `model-export/`:
   ```bash
   cd ../../model-export
   python download_models.py
   python export_onnx.py --model en-indic
   python quantize_onnx.py --all
   ```
2. Run the copy helper:
   ```bash
   python copy_to_app.py
   ```
   This copies `onnx-quantized/<direction>/*.onnx` and the matching tokenizer
   files into `app/assets/models/<direction>/`.

3. Re-run `npx expo prebuild` so the new assets are picked up by the native
   build.

## Placeholder files

The `.onnx`, `vocab.json`, and `merges.txt` files currently in this directory
are empty placeholders. Metro requires them to exist at bundle time but does
not validate their content. They will be silently replaced when you run
`copy_to_app.py`.

## Bundle size implications

The full Northeast model set (3 directions × 2 ONNX files + tokenizers) is
roughly **840 MB** in INT8. This is a large iOS/Android binary, but it is
the price of true offline operation. After install, no further downloads are
needed for the languages of Assam, Tripura, Manipur, Meghalaya, Mizoram,
Nagaland, Sikkim, and Arunachal Pradesh (Tier 1 set).
