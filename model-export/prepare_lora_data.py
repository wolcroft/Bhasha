"""
Bhasha — Prepare parallel training data for LoRA fine-tuning
=============================================================
Converts a raw parallel corpus into the JSONL format that finetune_lora.py
expects:
    data/<lang>/train.jsonl
    data/<lang>/dev.jsonl

Each line is `{"src": "<English>", "tgt": "<target language>"}`.

Why a separate prep step? The realistic data sources for Mizo (lus_Latn) and
Khasi (kha_Latn) ship in widely different shapes — TSV from OPUS, parallel
text files from bible corpora, JSON dumps from community projects — so the
pipeline does the conversion once, up front, and the trainer never has to
care.

Realistic data sources (as of 2026):

  Mizo (lus_Latn)
    - christos-c/bible-corpus on HuggingFace (~30k verses, English↔Mizo)
    - OPUS Tatoeba (small but high quality)
    - JW300 corpus (legally restricted; check terms before use)
    - Mizo Bible from biblegateway/bible.com (manual scrape, verse-aligned)

  Khasi (kha_Latn)
    - christos-c/bible-corpus on HuggingFace (~30k verses, English↔Khasi)
    - Khasi Bible from the Khasi Hills Bible Society
    - Wikipedia dumps (very small, mostly stubs)

  Confirmed-empty sources (do NOT bother):
    - AI4Bharat BPCC: no Mizo, no Khasi (only the 22 scheduled languages)
    - WMT24 LR-Indic: same scheduled-language scope
    - FLORES-200: includes Mizo as a dev/test set but the data is too
      small to fine-tune on (only ~2k sentences total)

Usage:
    # From a TSV file (one pair per line: english<TAB>target):
    python prepare_lora_data.py --lang lus_Latn --tsv ./raw/mizo_bible.tsv

    # From two parallel plain-text files (line N must align):
    python prepare_lora_data.py --lang kha_Latn \\
        --src-file ./raw/khasi/english.txt \\
        --tgt-file ./raw/khasi/khasi.txt

    # From a JSONL file with arbitrary key names:
    python prepare_lora_data.py --lang lus_Latn \\
        --jsonl ./raw/mizo.jsonl --src-key english --tgt-key mizo

The script always:
  - Strips trailing whitespace and skips empty/blank pairs
  - Drops pairs where either side is < 3 chars or > 500 chars
  - Drops pairs where length ratio is wildly off (>5x — almost always
    misaligned)
  - Deduplicates exact-match pairs
  - Splits 95/5 train/dev (deterministic seed for reproducibility)
"""

import argparse
import json
import random
import sys
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).parent
DATA_DIR = ROOT / "data"

SUPPORTED_LANGS = ("lus_Latn", "kha_Latn")

# Filtering thresholds — chosen to drop obvious misalignments without
# trimming legitimate short/long sentences.
MIN_CHARS = 3
MAX_CHARS = 500
MAX_LEN_RATIO = 5.0


def _iter_tsv(path: Path) -> Iterable[tuple[str, str]]:
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 2:
                continue
            yield parts[0], parts[1]


def _iter_parallel_files(src_path: Path, tgt_path: Path) -> Iterable[tuple[str, str]]:
    with open(src_path, "r", encoding="utf-8") as fs, open(tgt_path, "r", encoding="utf-8") as ft:
        for src_line, tgt_line in zip(fs, ft):
            yield src_line.rstrip("\n"), tgt_line.rstrip("\n")


def _iter_jsonl(path: Path, src_key: str, tgt_key: str) -> Iterable[tuple[str, str]]:
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            if src_key not in obj or tgt_key not in obj:
                continue
            yield str(obj[src_key]), str(obj[tgt_key])


def _filter_pairs(pairs: Iterable[tuple[str, str]]) -> list[tuple[str, str]]:
    seen: set[tuple[str, str]] = set()
    out: list[tuple[str, str]] = []
    dropped_short = dropped_long = dropped_ratio = dropped_dup = 0

    for src, tgt in pairs:
        src = src.strip()
        tgt = tgt.strip()
        if len(src) < MIN_CHARS or len(tgt) < MIN_CHARS:
            dropped_short += 1
            continue
        if len(src) > MAX_CHARS or len(tgt) > MAX_CHARS:
            dropped_long += 1
            continue
        ratio = max(len(src), len(tgt)) / max(min(len(src), len(tgt)), 1)
        if ratio > MAX_LEN_RATIO:
            dropped_ratio += 1
            continue
        key = (src, tgt)
        if key in seen:
            dropped_dup += 1
            continue
        seen.add(key)
        out.append(key)

    print(
        f"  filter: kept {len(out)}, "
        f"dropped {dropped_short} short, {dropped_long} long, "
        f"{dropped_ratio} ratio, {dropped_dup} dup"
    )
    return out


def _write_split(pairs: list[tuple[str, str]], out_dir: Path, dev_fraction: float = 0.05) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    rng = random.Random(42)
    shuffled = pairs[:]
    rng.shuffle(shuffled)
    n_dev = max(1, int(len(shuffled) * dev_fraction))
    dev = shuffled[:n_dev]
    train = shuffled[n_dev:]

    def _dump(items: list[tuple[str, str]], path: Path) -> None:
        with open(path, "w", encoding="utf-8") as f:
            for src, tgt in items:
                f.write(json.dumps({"src": src, "tgt": tgt}, ensure_ascii=False) + "\n")

    _dump(train, out_dir / "train.jsonl")
    _dump(dev, out_dir / "dev.jsonl")
    print(f"  wrote train={len(train)}  dev={len(dev)}  → {out_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare parallel data for LoRA fine-tuning")
    parser.add_argument("--lang", required=True, choices=SUPPORTED_LANGS)
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--tsv", type=Path, help="TSV file: english<TAB>target per line")
    src.add_argument("--jsonl", type=Path, help="JSONL file with --src-key/--tgt-key")
    src.add_argument("--src-file", type=Path, help="Plain text English file (paired with --tgt-file)")
    parser.add_argument("--tgt-file", type=Path, help="Plain text target file (line-aligned)")
    parser.add_argument("--src-key", default="en", help="JSON key for English (default: en)")
    parser.add_argument("--tgt-key", default=None, help="JSON key for target (default: lang code)")
    args = parser.parse_args()

    if args.src_file and not args.tgt_file:
        parser.error("--src-file requires --tgt-file")

    if args.tsv:
        pairs = _iter_tsv(args.tsv)
        source_label = str(args.tsv)
    elif args.jsonl:
        tgt_key = args.tgt_key or args.lang
        pairs = _iter_jsonl(args.jsonl, args.src_key, tgt_key)
        source_label = f"{args.jsonl} (src={args.src_key}, tgt={tgt_key})"
    else:
        pairs = _iter_parallel_files(args.src_file, args.tgt_file)
        source_label = f"{args.src_file} || {args.tgt_file}"

    print(f"==> Preparing {args.lang} data from {source_label}")
    filtered = _filter_pairs(pairs)
    if not filtered:
        print("ERROR: no usable pairs after filtering — check input format")
        sys.exit(1)

    out_dir = DATA_DIR / args.lang
    _write_split(filtered, out_dir)
    print("\nNext: python finetune_lora.py --lang", args.lang)


if __name__ == "__main__":
    main()
