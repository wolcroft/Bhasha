#!/usr/bin/env bash
# Bhasha — Model Export Environment Setup
# Run once on Mac M2 Pro to prepare the Python venv for model export

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/bhasha-models"

echo "==> Creating Python venv at $VENV_DIR"
python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"

echo "==> Upgrading pip"
pip install --upgrade pip

echo "==> Installing PyTorch (CPU + MPS for M2 Pro)"
pip install torch torchvision torchaudio

echo "==> Installing HuggingFace + tokenizer deps"
pip install transformers==4.40.0 sentencepiece protobuf sacremoses

echo "==> Installing ONNX + ONNX Runtime tools"
pip install onnx==1.16.0 onnxruntime==1.18.0 onnxruntime-tools

echo "==> Installing quantization + evaluation tools"
pip install onnxruntime-extensions numpy scipy sacrebleu

echo "==> Installing IndicTrans2 dependencies"
pip install indic-nlp-library mosestokenizer

echo "==> Installing download + utility tools"
pip install huggingface_hub tqdm psutil

echo ""
echo "✅  Environment ready."
echo "    Activate with: source $VENV_DIR/bin/activate"
echo "    Then run:      python download_models.py"
