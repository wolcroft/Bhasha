/**
 * OnnxTokenizer — wraps the SentencePiece+remap ONNX graphs built by
 * model-export/build_tokenizer_onnx.py.
 *
 * Why this exists: IndicTrans2's tokenization is SentencePiece pieces plus a
 * fairseq-style dict remap plus a per-direction language tag prefix and EOS
 * suffix. There's no production-grade JS implementation of that pipeline, so
 * we ship two tiny ONNX graphs (tokenizer.onnx + detokenizer.onnx) per
 * direction and call them from JS through onnxruntime-react-native — exactly
 * how the encoder/decoder are called. The native side already has SentencePiece
 * available via onnxruntime-extensions; we just need
 * `onnxruntimeExtensionsEnabled: "true"` in app/package.json so it's linked.
 *
 * Public surface:
 *   load(...)         construct from already-resolved file URIs + tokens.json
 *   encode(text)      → input_ids/attention_mask tensors, ready for the encoder
 *   decode(ids)       → string (specials/lang tags stripped before passing)
 *   decoderStartId    forced first token for the decoder loop
 *   eosId             stop condition for the decoder loop
 */

import * as ort from 'onnxruntime-react-native';
import type { InferenceSession, Tensor } from 'onnxruntime-react-native';

export interface TokenizerSpecials {
  bos: number;
  pad: number;
  eos: number;
  unk: number;
}

export interface TokenizerMeta {
  specials: TokenizerSpecials;
  decoder_start_token_id: number;
  /** Map from IndicTrans2 language tag (e.g. "eng_Latn") to its fairseq dict id. */
  src_lang_ids: Record<string, number>;
}

export interface EncodedInputs {
  inputIds: Tensor;       // INT64 [1, L]
  attentionMask: Tensor;  // INT64 [1, L]
}

const SESSION_OPTIONS: ort.InferenceSession.SessionOptions = {
  executionProviders: ['cpu'],
  graphOptimizationLevel: 'all',
};

export class OnnxTokenizer {
  private constructor(
    private readonly tokSession: InferenceSession,
    private readonly detokSession: InferenceSession,
    private readonly meta: TokenizerMeta,
    public readonly srcLang: string,
    public readonly tgtLang: string,
  ) {}

  static async load(
    tokenizerPath: string,
    detokenizerPath: string,
    meta: TokenizerMeta,
    srcLang: string,
    tgtLang: string,
  ): Promise<OnnxTokenizer> {
    if (!(srcLang in meta.src_lang_ids)) {
      throw new Error(`Tokenizer: srcLang "${srcLang}" not in this direction's lang table`);
    }
    if (!(tgtLang in meta.src_lang_ids)) {
      throw new Error(`Tokenizer: tgtLang "${tgtLang}" not in this direction's lang table`);
    }
    const [tok, detok] = await Promise.all([
      ort.InferenceSession.create(tokenizerPath, SESSION_OPTIONS),
      ort.InferenceSession.create(detokenizerPath, SESSION_OPTIONS),
    ]);
    return new OnnxTokenizer(tok, detok, meta, srcLang, tgtLang);
  }

  async release(): Promise<void> {
    await Promise.all([this.tokSession.release(), this.detokSession.release()]);
  }

  /** Tokenize one sentence. The src/tgt lang tags are baked in by the ONNX graph. */
  async encode(text: string): Promise<EncodedInputs> {
    const srcLangId = BigInt(this.meta.src_lang_ids[this.srcLang]);
    const tgtLangId = BigInt(this.meta.src_lang_ids[this.tgtLang]);

    const out = await this.tokSession.run({
      text: new ort.Tensor('string', [text], [1]),
      src_lang_id: new ort.Tensor('int64', BigInt64Array.from([srcLangId]), [1]),
      tgt_lang_id: new ort.Tensor('int64', BigInt64Array.from([tgtLangId]), [1]),
    });

    return {
      inputIds: out['input_ids'] as Tensor,
      attentionMask: out['attention_mask'] as Tensor,
    };
  }

  /**
   * Decode model output ids back to text. Specials and any language-tag ids
   * are stripped before being passed into the SentencepieceDecoder graph;
   * SP would otherwise emit "<unk>" or empty pieces for them.
   */
  async decode(ids: number[]): Promise<string> {
    const { bos, pad, eos } = this.meta.specials;
    const drop = new Set<number>([bos, pad, eos, ...Object.values(this.meta.src_lang_ids)]);
    const filtered = ids.filter((id) => !drop.has(id));
    if (filtered.length === 0) return '';

    const idsTensor = new ort.Tensor(
      'int64',
      BigInt64Array.from(filtered.map((n) => BigInt(n))),
      [filtered.length],
    );
    const out = await this.detokSession.run({ ids: idsTensor });
    const strTensor = out['text'] as Tensor;
    const data = strTensor.data as unknown as string[];
    return (data[0] ?? '').trim();
  }

  get decoderStartId(): number {
    return this.meta.decoder_start_token_id;
  }

  get eosId(): number {
    return this.meta.specials.eos;
  }

  get padId(): number {
    return this.meta.specials.pad;
  }
}
