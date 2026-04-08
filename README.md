# Bhasha — Offline Indian Language Translator

A fully offline mobile translator for the 22 scheduled Indian languages, plus
Northeast India's underserved tongues. Text, voice, conversation, and camera
modes — all running on-device with zero internet after first setup.

## Project layout

```
bhasha/
├── model-export/           # Python pipeline: download → ONNX export → INT8 quantize → benchmark
│   ├── setup_env.sh
│   ├── download_models.py
│   ├── export_onnx.py
│   ├── quantize_onnx.py
│   ├── benchmark.py
│   └── README.md
└── app/                    # React Native (Expo SDK 54) mobile app
    ├── app/                #   Expo Router screens
    │   ├── (tabs)/         #     translate, conversation, camera, settings
    │   ├── _layout.tsx
    │   ├── index.tsx
    │   └── onboarding.tsx
    ├── src/
    │   ├── engine/         #   ML pipeline modules
    │   │   ├── translation/ #     IndicProcessor, BPE tokenizer, OnnxTranslator
    │   │   ├── stt/         #     Whisper, Sherpa-ONNX
    │   │   ├── tts/         #     Sherpa-ONNX (Piper / Kokoro)
    │   │   ├── ocr/         #     ExecuTorch OCR
    │   │   └── langDetect/  #     fastText / heuristics
    │   ├── models/          #   ModelManager, LanguagePack, storage
    │   ├── ui/              #   Components + theme
    │   └── utils/           #   languages, scripts, audio helpers
    └── ...
```

## Quick start

### 1. Export the translation models (one-time, on Mac M2 Pro)

```bash
cd model-export
./setup_env.sh
source bhasha-models/bin/activate
python download_models.py            # ~1.5 GB per direction
python export_onnx.py --model en-indic
python export_onnx.py --model indic-en
python export_onnx.py --model indic-indic
python quantize_onnx.py --all
python benchmark.py --all --quantized
```

See `model-export/README.md` for details.

### 2. Run the app

```bash
cd app
npm install
npx expo prebuild               # Generates iOS + Android native projects
npx expo run:ios                # Or: npx expo run:android
```

## Architecture highlights

- **Translation engine**: IndicTrans2 distilled (200M / 320M) → custom ONNX export
  with split encoder/decoder → INT8 quantization → `onnxruntime-react-native`
- **STT**: Whisper via `react-native-executorch` (primary), Sherpa-ONNX (fallback)
- **TTS**: Sherpa-ONNX with Piper VITS / Kokoro voice models
- **OCR**: ExecuTorch OCR for Indic scripts
- **Language detection**: fastText `lid.176.ftz` + script-based heuristic fast path
- **Storage**: All models live in app sandbox under `Documents/models/<direction>/`

## Phases

| Phase | Status | What |
|-------|--------|------|
| 0 — Model export pipeline | ✅ Scaffolded | Python scripts for download / ONNX / quantize / benchmark |
| 1 — Text translation MVP | ✅ Scaffolded | Translate tab, language picker, history, settings |
| 2 — Voice pipeline | ✅ Scaffolded | STT, TTS, conversation mode |
| 3 — Camera / OCR | ✅ Scaffolded | Camera tab with OCR + translation overlay |
| 4 — NE language LoRA fine-tuning | 🟡 Planned | Tier 2 languages via QLoRA on Mac M2 Pro |
| 5 — Polish + community | 🟡 In progress | Onboarding, accessibility, validation pipeline |

## Honest hard parts (still TODO)

1. **IndicProcessor JS port** — only the core normalisation/tokenisation paths
   are ported. Edge cases for some Indic scripts need testing against the Python
   reference implementation.
2. **ONNX export of IndicTrans2** — script handles standard checkpoints; some
   trust_remote_code variants may need encoder/decoder attribute path tweaks.
3. **Beam search decode** — current `OnnxTranslator` implements greedy decode.
   Beam search (width 4-5) gives noticeably better quality and should be added
   before the v1.0 release.
4. **Real CDN URLs** — `LANGUAGE_PACKS` currently points to placeholder URLs.
   Need to host the quantized model bundles somewhere reliable (HuggingFace
   Hub LFS, R2, or S3 + CloudFront).

## License

TBD
