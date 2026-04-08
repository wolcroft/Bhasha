/**
 * OnnxTranslator — On-device IndicTrans2 inference via ONNX Runtime
 *
 * Pipeline (per sentence):
 *   raw text
 *     → IndicProcessor.normalize        (script + whitespace)
 *     → OnnxTokenizer.encode            (text → input_ids/attention_mask tensors)
 *     → encoder ONNX                    (→ encoder_hidden_states)
 *     → greedy / beam decode loop       (→ target ids)
 *     → OnnxTokenizer.decode            (target ids → text)
 *
 * The encoder and decoder are separate ONNX graphs (matching the split export
 * from export_onnx.py). Tokenizer/detokenizer are also separate ONNX graphs
 * built by build_tokenizer_onnx.py — they use onnxruntime-extensions custom
 * ops, which means the React Native app must be built with
 * `onnxruntimeExtensionsEnabled: "true"` in package.json.
 */

import * as ort from 'onnxruntime-react-native';
import type { InferenceSession, Tensor } from 'onnxruntime-react-native';
import { IndicProcessor } from './IndicProcessor';
import { OnnxTokenizer, type TokenizerMeta } from './tokenizer';

export type ModelDirection =
  | 'en-indic'
  | 'indic-en'
  | 'indic-indic'
  | 'en-lus_Latn'
  | 'en-kha_Latn';

export interface TranslatorOptions {
  maxLength?: number;     // Max tokens to generate (default 256)
  beamSize?: number;      // Beam search width (1 = greedy, default 5)
  lengthPenalty?: number; // Length normalisation alpha, default 0.6
}

export interface TranslationResult {
  translation: string;
  latencyMs: number;
}

/** File-URI bundle for one model direction (resolved by the asset layer). */
export interface ModelPaths {
  encoder: string;
  decoder: string;
  tokenizer: string;
  detokenizer: string;
  /** Parsed contents of tokens.json — already in memory because it's a JS require. */
  tokensMeta: TokenizerMeta;
}

/**
 * Manages encoder + decoder + tokenizer/detokenizer ONNX sessions for one
 * model direction. Holds them across translate() calls so loading happens
 * exactly once per direction switch.
 */
export class OnnxTranslator {
  private encSession: InferenceSession | null = null;
  private decSession: InferenceSession | null = null;
  private tokenizer: OnnxTokenizer | null = null;
  private direction: ModelDirection | null = null;
  private srcLang: string | null = null;
  private tgtLang: string | null = null;

  private readonly processor = new IndicProcessor();

  async load(
    paths: ModelPaths,
    direction: ModelDirection,
    srcLang: string,
    tgtLang: string,
  ): Promise<void> {
    if (
      this.direction === direction &&
      this.srcLang === srcLang &&
      this.tgtLang === tgtLang &&
      this.encSession
    ) {
      return;
    }
    await this.unload();

    const sessionOptions: ort.InferenceSession.SessionOptions = {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
      intraOpNumThreads: 4,
    };

    [this.encSession, this.decSession, this.tokenizer] = await Promise.all([
      ort.InferenceSession.create(paths.encoder, sessionOptions),
      ort.InferenceSession.create(paths.decoder, sessionOptions),
      OnnxTokenizer.load(paths.tokenizer, paths.detokenizer, paths.tokensMeta, srcLang, tgtLang),
    ]);

    this.direction = direction;
    this.srcLang = srcLang;
    this.tgtLang = tgtLang;
  }

  async unload(): Promise<void> {
    await this.encSession?.release();
    await this.decSession?.release();
    await this.tokenizer?.release();
    this.encSession = null;
    this.decSession = null;
    this.tokenizer = null;
    this.direction = null;
    this.srcLang = null;
    this.tgtLang = null;
  }

  get isLoaded(): boolean {
    return this.encSession !== null && this.decSession !== null && this.tokenizer !== null;
  }

  async translate(text: string, options: TranslatorOptions = {}): Promise<TranslationResult> {
    if (!this.isLoaded) throw new Error('OnnxTranslator: not loaded. Call load() first.');

    const start = Date.now();
    const { maxLength = 256, beamSize = 5, lengthPenalty = 0.6 } = options;
    const tokenizer = this.tokenizer!;

    const sentences = this.processor.splitIntoSentences(text, this.srcLang!);
    const translations: string[] = [];

    for (const raw of sentences) {
      const normalized = this.processor.normalize(raw, this.srcLang!);
      const { inputIds, attentionMask } = await tokenizer.encode(normalized);
      const ids = await this.translateOne(inputIds, attentionMask, maxLength, beamSize, lengthPenalty);
      translations.push(await tokenizer.decode(ids));
    }

    return {
      translation: translations.join(' ').trim(),
      latencyMs: Date.now() - start,
    };
  }

  /** Encode source then dispatch to greedy or beam search. */
  private async translateOne(
    inputIds: Tensor,
    attentionMask: Tensor,
    maxLength: number,
    beamSize: number,
    lengthPenalty: number,
  ): Promise<number[]> {
    const enc = this.encSession!;
    const encOutput = await enc.run({
      input_ids: inputIds,
      attention_mask: attentionMask,
    });
    const encoderHiddenStates = encOutput['last_hidden_state'] as Tensor;

    if (beamSize <= 1) {
      return this.greedyDecode(encoderHiddenStates, attentionMask, maxLength);
    }
    return this.beamSearchDecode(encoderHiddenStates, attentionMask, maxLength, beamSize, lengthPenalty);
  }

  // ─── Greedy decode ─────────────────────────────────────────────────────────

  private async greedyDecode(
    encoderHiddenStates: Tensor,
    encoderAttentionMask: Tensor,
    maxLength: number,
  ): Promise<number[]> {
    const dec = this.decSession!;
    const tok = this.tokenizer!;
    // IndicTrans2 uses </s> as the decoder start token (decoder_start_token_id == eos).
    const generated: number[] = [tok.decoderStartId];

    for (let step = 0; step < maxLength; step++) {
      const decInputIds = new ort.Tensor(
        'int64',
        BigInt64Array.from(generated.map((n) => BigInt(n))),
        [1, generated.length],
      );

      const out = await dec.run({
        input_ids: decInputIds,
        encoder_hidden_states: encoderHiddenStates,
        encoder_attention_mask: encoderAttentionMask,
      });

      const logits = out['logits'] as Tensor;
      const vocabSize = logits.dims[2];
      const data = logits.data as Float32Array;
      const offset = (generated.length - 1) * vocabSize;
      const next = argmax(data, offset, vocabSize);
      generated.push(next);

      // The first token is the synthetic start (== eos id), so we only treat
      // a *generated* eos as the stop condition.
      if (step > 0 && next === tok.eosId) break;
    }

    return generated;
  }

  // ─── Beam search decode ────────────────────────────────────────────────────
  //
  // A reasonably faithful Hugging Face-style beam search:
  //   - Maintains `beamSize` active beams (with running log-prob sums)
  //   - At each step, expands every beam to the top-`beamSize` next tokens
  //   - Keeps the global top-`beamSize` candidates
  //   - Finished beams (hit EOS) are scored with length penalty (length ** alpha)
  //     and held aside
  //   - Stops when all beams have finished or maxLength is reached
  //
  // Note: each beam triggers a separate decoder forward pass per step. This is
  // naive (no KV cache) — fine for short translations but slower than greedy.

  private async beamSearchDecode(
    encoderHiddenStates: Tensor,
    encoderAttentionMask: Tensor,
    maxLength: number,
    beamSize: number,
    lengthPenalty: number,
  ): Promise<number[]> {
    const dec = this.decSession!;
    const tok = this.tokenizer!;
    const eosId = tok.eosId;
    const startId = tok.decoderStartId;

    interface Beam { tokens: number[]; score: number; }
    let beams: Beam[] = [{ tokens: [startId], score: 0 }];
    const finished: Beam[] = [];

    for (let step = 0; step < maxLength; step++) {
      const candidates: Beam[] = [];

      for (const beam of beams) {
        const decInputIds = new ort.Tensor(
          'int64',
          BigInt64Array.from(beam.tokens.map((n) => BigInt(n))),
          [1, beam.tokens.length],
        );

        const out = await dec.run({
          input_ids: decInputIds,
          encoder_hidden_states: encoderHiddenStates,
          encoder_attention_mask: encoderAttentionMask,
        });

        const logits = out['logits'] as Tensor;
        const vocabSize = logits.dims[2];
        const data = logits.data as Float32Array;
        const offset = (beam.tokens.length - 1) * vocabSize;

        const logProbs = logSoftmax(data, offset, vocabSize);
        const topK = topKIndices(logProbs, beamSize);
        for (const idx of topK) {
          candidates.push({
            tokens: [...beam.tokens, idx],
            score: beam.score + logProbs[idx],
          });
        }
      }

      candidates.sort((a, b) => b.score - a.score);
      const next: Beam[] = [];
      for (const cand of candidates) {
        if (next.length >= beamSize) break;
        const lastTok = cand.tokens[cand.tokens.length - 1];
        // Same caveat as greedy: only treat a *generated* eos as final.
        if (cand.tokens.length > 1 && lastTok === eosId) {
          finished.push(cand);
        } else {
          next.push(cand);
        }
      }

      beams = next;
      if (beams.length === 0) break;
    }

    for (const beam of beams) {
      finished.push({ tokens: [...beam.tokens, eosId], score: beam.score });
    }

    const scored = finished.map((b) => ({
      beam: b,
      norm: b.score / Math.pow(b.tokens.length, lengthPenalty),
    }));
    scored.sort((a, b) => b.norm - a.norm);
    return scored[0]?.beam.tokens ?? [startId, eosId];
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function argmax(arr: Float32Array, offset = 0, length = arr.length): number {
  let maxIdx = 0;
  let maxVal = arr[offset];
  for (let i = 1; i < length; i++) {
    const v = arr[offset + i];
    if (v > maxVal) {
      maxVal = v;
      maxIdx = i;
    }
  }
  return maxIdx;
}

function logSoftmax(arr: Float32Array, offset: number, length: number): Float32Array {
  let max = -Infinity;
  for (let i = 0; i < length; i++) {
    const v = arr[offset + i];
    if (v > max) max = v;
  }
  let sumExp = 0;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = arr[offset + i] - max;
    sumExp += Math.exp(out[i]);
  }
  const logSum = Math.log(sumExp);
  for (let i = 0; i < length; i++) {
    out[i] -= logSum;
  }
  return out;
}

/** Returns indices of the k largest values in arr (descending). */
function topKIndices(arr: Float32Array, k: number): number[] {
  const heap: { idx: number; val: number }[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (heap.length < k) {
      heap.push({ idx: i, val: arr[i] });
      if (heap.length === k) heap.sort((a, b) => a.val - b.val);
    } else if (arr[i] > heap[0].val) {
      heap[0] = { idx: i, val: arr[i] };
      heap.sort((a, b) => a.val - b.val);
    }
  }
  return heap.sort((a, b) => b.val - a.val).map((h) => h.idx);
}

// ─── Singleton cache ──────────────────────────────────────────────────────────

const translatorCache = new Map<ModelDirection, OnnxTranslator>();

export function getTranslator(direction: ModelDirection): OnnxTranslator {
  if (!translatorCache.has(direction)) {
    translatorCache.set(direction, new OnnxTranslator());
  }
  return translatorCache.get(direction)!;
}

export function clearTranslatorCache(): void {
  for (const t of translatorCache.values()) {
    t.unload().catch(() => {});
  }
  translatorCache.clear();
}
