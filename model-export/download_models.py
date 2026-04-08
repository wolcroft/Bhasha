"""
Bhasha — Model Downloader
Downloads IndicTrans2 distilled models + auxiliary models (Whisper, fastText)
from HuggingFace Hub and organises them under ./models/
"""

import os
import sys
from pathlib import Path
from huggingface_hub import snapshot_download, login

MODELS_DIR = Path(__file__).parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

# HF token can be supplied via:
#   1. HF_TOKEN env var (preferred)
#   2. The HF_TOKEN constant below (committed-friendly default for dev)
# IndicTrans2 distilled models are public — token is only needed for gated repos.
HF_TOKEN = os.environ.get("HF_TOKEN") or ""
if HF_TOKEN:
    try:
        login(token=HF_TOKEN, add_to_git_credential=False)
        print(f"==> Authenticated with HuggingFace (token: ...{HF_TOKEN[-6:]})")
    except Exception as exc:
        print(f"WARN: HF login failed — proceeding anonymously: {exc}")

INDICTRANS2_MODELS = [
    {
        "repo_id": "ai4bharat/indictrans2-en-indic-dist-200M",
        "local_dir": MODELS_DIR / "en-indic",
        "description": "English → 22 Indic languages (200M distilled)",
    },
    {
        "repo_id": "ai4bharat/indictrans2-indic-en-dist-200M",
        "local_dir": MODELS_DIR / "indic-en",
        "description": "22 Indic languages → English (200M distilled)",
    },
    {
        "repo_id": "ai4bharat/indictrans2-indic-indic-dist-320M",
        "local_dir": MODELS_DIR / "indic-indic",
        "description": "Indic ↔ Indic (320M distilled)",
    },
]

WHISPER_MODEL = {
    "repo_id": "openai/whisper-base",
    "local_dir": MODELS_DIR / "whisper-base",
    "description": "Whisper base STT model",
}

def download_model(repo_id: str, local_dir: Path, description: str) -> None:
    print(f"\n==> Downloading: {description}")
    print(f"    repo: {repo_id}")
    print(f"    dest: {local_dir}")
    snapshot_download(
        repo_id=repo_id,
        local_dir=str(local_dir),
        ignore_patterns=["*.msgpack", "*.h5", "flax_model*", "tf_model*", "rust_model*"],
    )
    print(f"    Done.")


def main():
    targets = INDICTRANS2_MODELS + [WHISPER_MODEL]

    if len(sys.argv) > 1:
        # Allow selective download: python download_models.py en-indic
        keys = sys.argv[1:]
        targets = [m for m in targets if any(k in m["repo_id"] for k in keys)]
        if not targets:
            print(f"No models matched: {keys}")
            sys.exit(1)

    for model in targets:
        download_model(**model)

    print("\n✅  All models downloaded to ./models/")


if __name__ == "__main__":
    main()
