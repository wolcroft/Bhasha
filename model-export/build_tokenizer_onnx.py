"""
Bhasha — Build standalone tokenizer/detokenizer ONNX graphs
=============================================================
IndicTrans2 uses a custom tokenization stack: SentencePiece pieces remapped
through a fairseq-style dict (dict.SRC.json / dict.TGT.json), with language
tags prepended and EOS appended on the source side. There is no off-the-shelf
JS implementation of this, so we bake the entire thing into ONNX graphs that
the React Native app loads alongside the encoder/decoder.

Output (per direction): two small ONNX models in onnx-quantized/<dir>/

  tokenizer.onnx
    inputs:
      text          STRING [1]   — single sentence (already script-normalized
                                    but NOT lang-tagged; the graph adds those)
      src_lang_id   INT64  [1]   — fairseq dict id for the source language tag
      tgt_lang_id   INT64  [1]   — fairseq dict id for the target language tag
    outputs:
      input_ids       INT64 [1, L]
      attention_mask  INT64 [1, L]

  detokenizer.onnx
    inputs:
      ids   INT64 [L]   — fairseq target ids (caller is responsible for stripping
                          BOS/EOS/PAD/lang-tag specials before calling)
    outputs:
      text  STRING [1]

  tokens.json
    {
      "specials": {"bos","pad","eos","unk"},
      "decoder_start_token_id": <int>,   # always 2 (</s>) for IndicTrans2
      "src_lang_ids": {tag→fairseq id}   # for filling tokenizer.onnx inputs
    }
    The decoder is primed with </s> (not a tgt-lang tag). Target language is
    communicated to the model exclusively via the source-side prefix
    [src_lang, tgt_lang, ...source pieces...].

Why per-direction graphs (not a single shared one)?
  - Each direction has different SP models (model.SRC, model.TGT) and different
    dict.{SRC,TGT}.json files. The remap table is direction-specific.
  - en-indic.SRC ≠ indic-en.SRC even though both call themselves "SRC", because
    they were trained with different vocabularies.

Requires onnxruntime-extensions==0.13.0 in this venv. The matching native AAR
must be enabled in the React Native app via package.json:
    "onnxruntimeExtensionsEnabled": "true"
"""

import argparse
import json
import re
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper
from sentencepiece import SentencePieceProcessor

# onnxruntime-extensions custom op domain
EXT_DOMAIN = "ai.onnx.contrib"
EXT_OPSET_VERSION = 1
ONNX_OPSET = 17

MODELS_DIR = Path(__file__).parent / "models"
QUANTIZED_DIR = Path(__file__).parent / "onnx-quantized"
DIRECTIONS = ["en-indic", "indic-en", "indic-indic"]

# Matches IndicTrans2 language tags like "eng_Latn", "hin_Deva", "kha_Latn".
LANG_TAG_RE = re.compile(r"^[a-z]{3}_[A-Z][a-z]{3}$")
SPECIAL_TOKENS = ("<s>", "<pad>", "</s>", "<unk>")
SPECIAL_KEYS = ("bos", "pad", "eos", "unk")


def _extract_lang_ids(fairseq_dict: dict) -> dict:
    return {tok: tid for tok, tid in fairseq_dict.items() if LANG_TAG_RE.match(tok)}


def _extract_specials(fairseq_dict: dict) -> dict:
    return {key: fairseq_dict[tok] for key, tok in zip(SPECIAL_KEYS, SPECIAL_TOKENS)}


# ─── Remap table builders ─────────────────────────────────────────────────────


def build_sp_to_dict_remap(sp: SentencePieceProcessor, fairseq_dict: dict) -> np.ndarray:
    """For each SP id i, output the fairseq dict id of sp.IdToPiece(i),
    or the dict's <unk> id if the piece is not in the dict."""
    unk_id = fairseq_dict["<unk>"]
    table = np.full(sp.GetPieceSize(), unk_id, dtype=np.int64)
    for i in range(sp.GetPieceSize()):
        piece = sp.IdToPiece(i)
        if piece in fairseq_dict:
            table[i] = fairseq_dict[piece]
    return table


def build_dict_to_sp_remap(sp: SentencePieceProcessor, fairseq_dict: dict) -> np.ndarray:
    """Inverse: for each fairseq dict id, output the SP id of that piece, or
    SP <unk> (id 0) if no SP piece exists. Specials and lang tags map to 0."""
    # Build SP piece → SP id once
    sp_index = {sp.IdToPiece(i): i for i in range(sp.GetPieceSize())}
    table = np.zeros(len(fairseq_dict), dtype=np.int64)
    for piece, dict_id in fairseq_dict.items():
        table[dict_id] = sp_index.get(piece, 0)
    return table


# ─── Graph builders ───────────────────────────────────────────────────────────


def build_tokenizer_model(spm_bytes: bytes, sp_to_dict: np.ndarray, eos_id: int) -> onnx.ModelProto:
    """Construct the encoder-side tokenizer graph.

    Pipeline:
      text → SentencepieceTokenizer → sp_tokens (INT32)
           → Cast INT64 → Gather(sp_to_dict) → fairseq_ids (INT64)
           → Concat([src_lang_id, tgt_lang_id, fairseq_ids, eos]) → 1-D
           → Reshape(1, -1) → input_ids
           → Shape → ConstantOfShape(1) → attention_mask
    """
    # Initializers — defaults required by the SentencepieceTokenizer custom op.
    # The op declares 7 graph-input slots; we feed constants for everything
    # except the actual text input.
    inits = [
        numpy_helper.from_array(np.array([0], dtype=np.int64), "nbest_size"),
        numpy_helper.from_array(np.array([0.0], dtype=np.float32), "alpha"),
        numpy_helper.from_array(np.array([False], dtype=np.bool_), "add_bos"),
        numpy_helper.from_array(np.array([False], dtype=np.bool_), "add_eos"),
        numpy_helper.from_array(np.array([False], dtype=np.bool_), "reverse"),
        numpy_helper.from_array(np.array([False], dtype=np.bool_), "fairseq"),
        numpy_helper.from_array(sp_to_dict, "sp_to_dict_table"),
        numpy_helper.from_array(np.array([eos_id], dtype=np.int64), "eos_const"),
        numpy_helper.from_array(np.array([1, -1], dtype=np.int64), "shape_1_neg1"),
    ]

    nodes = [
        # 1. SentencePiece tokenize. The `model` attribute carries the raw .model
        # protobuf bytes — onnxruntime-extensions reads them at session-create.
        helper.make_node(
            "SentencepieceTokenizer",
            inputs=["text", "nbest_size", "alpha", "add_bos", "add_eos", "reverse", "fairseq"],
            outputs=["sp_tokens", "instance_indices", "token_indices"],
            name="sp_tokenize",
            domain=EXT_DOMAIN,
            model=spm_bytes,
        ),
        # 2. Cast SP token ids INT32 → INT64 (Gather requires int64 indices on most builds).
        helper.make_node("Cast", ["sp_tokens"], ["sp_tokens_i64"], to=TensorProto.INT64),
        # 3. Remap SP id → fairseq dict id.
        helper.make_node("Gather", ["sp_to_dict_table", "sp_tokens_i64"], ["fairseq_ids"], axis=0),
        # 4. Build the full id sequence: [src_lang, tgt_lang, ...pieces..., eos]
        helper.make_node(
            "Concat",
            ["src_lang_id", "tgt_lang_id", "fairseq_ids", "eos_const"],
            ["combined_1d"],
            axis=0,
        ),
        # 5. Add batch dim → [1, L]
        helper.make_node("Reshape", ["combined_1d", "shape_1_neg1"], ["input_ids"]),
        # 6. attention_mask = ones_like(input_ids)
        helper.make_node("Shape", ["input_ids"], ["input_ids_shape"]),
        helper.make_node(
            "ConstantOfShape",
            ["input_ids_shape"],
            ["attention_mask"],
            value=helper.make_tensor("am_value", TensorProto.INT64, [1], [1]),
        ),
    ]

    inputs = [
        helper.make_tensor_value_info("text", TensorProto.STRING, [1]),
        helper.make_tensor_value_info("src_lang_id", TensorProto.INT64, [1]),
        helper.make_tensor_value_info("tgt_lang_id", TensorProto.INT64, [1]),
    ]
    outputs = [
        helper.make_tensor_value_info("input_ids", TensorProto.INT64, [1, None]),
        helper.make_tensor_value_info("attention_mask", TensorProto.INT64, [1, None]),
    ]

    graph = helper.make_graph(nodes, "bhasha_tokenizer", inputs, outputs, initializer=inits)
    model = helper.make_model(
        graph,
        opset_imports=[
            helper.make_operatorsetid("", ONNX_OPSET),
            helper.make_operatorsetid(EXT_DOMAIN, EXT_OPSET_VERSION),
        ],
    )
    model.ir_version = 8  # opset 17 → IR 8
    return model


def build_detokenizer_model(spm_bytes: bytes, dict_to_sp: np.ndarray) -> onnx.ModelProto:
    """Decoder-side: fairseq target ids → text.

    The caller (JS) is expected to strip BOS/EOS/PAD before invoking; that's
    cheaper than expressing a Compress filter inside ONNX, and it lets the
    JS layer also enforce its own stop conditions.
    """
    inits = [
        numpy_helper.from_array(dict_to_sp, "dict_to_sp_table"),
    ]

    nodes = [
        # Reverse remap: fairseq id → SP id
        helper.make_node("Gather", ["dict_to_sp_table", "ids"], ["sp_ids"], axis=0),
        # SentencePiece decode → STRING tensor of shape [1]
        helper.make_node(
            "SentencepieceDecoder",
            inputs=["sp_ids"],
            outputs=["text"],
            name="sp_decode",
            domain=EXT_DOMAIN,
            model=spm_bytes,
        ),
    ]

    inputs = [helper.make_tensor_value_info("ids", TensorProto.INT64, [None])]
    outputs = [helper.make_tensor_value_info("text", TensorProto.STRING, [1])]

    graph = helper.make_graph(nodes, "bhasha_detokenizer", inputs, outputs, initializer=inits)
    model = helper.make_model(
        graph,
        opset_imports=[
            helper.make_operatorsetid("", ONNX_OPSET),
            helper.make_operatorsetid(EXT_DOMAIN, EXT_OPSET_VERSION),
        ],
    )
    model.ir_version = 8
    return model


# ─── Per-direction driver ─────────────────────────────────────────────────────


def build_one(direction: str) -> None:
    src_dir = MODELS_DIR / direction
    dst_dir = QUANTIZED_DIR / direction
    dst_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n==> {direction}")
    src_dict = json.loads((src_dir / "dict.SRC.json").read_text())
    tgt_dict = json.loads((src_dir / "dict.TGT.json").read_text())

    src_spm_bytes = (src_dir / "model.SRC").read_bytes()
    tgt_spm_bytes = (src_dir / "model.TGT").read_bytes()
    src_sp = SentencePieceProcessor(model_proto=src_spm_bytes)
    tgt_sp = SentencePieceProcessor(model_proto=tgt_spm_bytes)

    sp_to_dict = build_sp_to_dict_remap(src_sp, src_dict)
    eos_id = src_dict["</s>"]
    print(f"  src SP→dict: {sp_to_dict.shape[0]} entries, eos_id={eos_id}")

    tok_model = build_tokenizer_model(src_spm_bytes, sp_to_dict, eos_id)
    onnx.checker.check_model(tok_model)
    tok_path = dst_dir / "tokenizer.onnx"
    onnx.save(tok_model, str(tok_path))
    print(f"  tokenizer.onnx → {tok_path.stat().st_size / 1e6:.2f} MB")

    dict_to_sp = build_dict_to_sp_remap(tgt_sp, tgt_dict)
    print(f"  tgt dict→SP: {dict_to_sp.shape[0]} entries")

    detok_model = build_detokenizer_model(tgt_spm_bytes, dict_to_sp)
    onnx.checker.check_model(detok_model)
    detok_path = dst_dir / "detokenizer.onnx"
    onnx.save(detok_model, str(detok_path))
    print(f"  detokenizer.onnx → {detok_path.stat().st_size / 1e6:.2f} MB")

    # Sidecar JSON: special-token ids (from src dict — same numerical values
    # are reused for the decoder loop's eos check) plus per-side language tag
    # tables. JS uses src table to look up the input lang and tgt table to
    # look up the forced-BOS for the decoder.
    gen_cfg = json.loads((src_dir / "generation_config.json").read_text())
    tokens_meta = {
        "specials": _extract_specials(src_dict),
        "decoder_start_token_id": gen_cfg["decoder_start_token_id"],
        "src_lang_ids": _extract_lang_ids(src_dict),
    }
    tokens_path = dst_dir / "tokens.json"
    tokens_path.write_text(json.dumps(tokens_meta, ensure_ascii=False, indent=2))
    print(f"  tokens.json: {len(tokens_meta['src_lang_ids'])} src tags")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--direction", choices=DIRECTIONS, help="Single direction; default = all")
    args = parser.parse_args()

    targets = [args.direction] if args.direction else DIRECTIONS
    for d in targets:
        build_one(d)
    print("\nDone.")


if __name__ == "__main__":
    main()
