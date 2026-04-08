/**
 * OnnxTranslator — On-device IndicTrans2 inference via ONNX Runtime
 *
 * Architecture:
 *   1. Encoder  → encodes source tokens to hidden states
 *   2. Decoder  → auto-regressively generates target tokens (greedy or beam)
 *
 * The encoder and decoder are separate ONNX graphs, matching the split export
 * from export_onnx.py. This is the standard seq2seq ONNX pattern.
 */

import * as ort from 'onnxruntime-react-native';
import type { InferenceSession, Tensor } from 'onnxruntime-react-native';
import type { IndicProcessor } from './IndicProcessor';
import type { BPETokenizer } from './tokenizer';

export type ModelDirection = 'en-indic' | 'indic-en' | 'indic-indic';

export interface TranslatorOptions {
  maxLength?: number;     // Max tokens to generate (default 256)
  beamSize?: number;      // Beam search width (1 = greedy, default 5)
  lengthPenalty?: number; // Length normalisation alpha, default 0.6
}

export interface TranslationResult {
  translation: string;
  latencyMs: number;
}

/**
 * Manages ONNX encoder + decoder sessions for one model direction.
 */
export class OnnxTranslator {
  private encSession: InferenceSession | null = null;
  private decSession: InferenceSession | null = null;
  private direction: ModelDirection | null = null;

  constructor(
    private processor: IndicProcessor,
    private tokenizer: BPETokenizer,
  ) {}

  /**
   * Load encoder + decoder ONNX models for a given direction.
   * modelDir is the local file:// path to the extracted model pack.
   */
  async load(modelDir: string, direction: ModelDirection): Promise<void> {
    if (this.direction === direction && this.encSession) return;

    await this.unload();

    const encPath = `${modelDir}/encoder_model_int8.onnx`;
    const decPath = `${modelDir}/decoder_model_int8.onnx`;

    const sessionOptions: ort.InferenceSession.SessionOptions = {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
      intraOpNumThreads: 4,
    };

    [this.encSession, this.decSession] = await Promise.all([
      ort.InferenceSession.create(encPath, sessionOptions),
      ort.InferenceSession.create(decPath, sessionOptions),
    ]);

    this.direction = direction;
  }

  async unload(): Promise<void> {
    await this.encSession?.release();
    await this.decSession?.release();
    this.encSession = null;
    this.decSession = null;
    this.direction = null;
  }

  get isLoaded(): boolean {
    return this.encSession !== null && this.decSession !== null;
  }

  /**
   * Translate a single string from srcLang to tgtLang.
   * Splits long inputs into sentences and joins them.
   */
  async translate(
    text: string,
    srcLang: string,
    tgtLang: string,
    options: TranslatorOptions = {},
  ): Promise<TranslationResult> {
    if (!this.isLoaded) throw new Error('OnnxTranslator: models not loaded. Call load() first.');

    const start = Date.now();
    const { maxLength = 256, beamSize = 5, lengthPenalty = 0.6 } = options;

    const sentences = this.processor.splitIntoSentences(text, srcLang);
    const translations: string[] = [];

    for (const sentence of sentences) {
      const batch = this.processor.preprocess([sentence], srcLang, tgtLang);
      const ids = await this.translateOne(
        batch.inputIds[0],
        batch.attentionMasks[0],
        maxLength,
        beamSize,
        lengthPenalty,
      );
      translations.push(this.processor.postprocess(ids));
    }

    return {
      translation: translations.join(' '),
      latencyMs: Date.now() - start,
    };
  }

  /** Encode source then dispatch to greedy or beam search. */
  private async translateOne(
    inputIds: number[],
    attentionMask: number[],
    maxLength: number,
    beamSize: number,
    lengthPenalty: number,
  ): Promise<number[]> {
    const enc = this.encSession!;

    const seqLen = inputIds.length;

    const inputIdsTensor = new ort.Tensor(
      'int64',
      BigInt64Array.from(inputIds.map(BigInt)),
      [1, seqLen],
    );
    const attentionMaskTensor = new ort.Tensor(
      'int64',
      BigInt64Array.from(attentionMask.map(BigInt)),
      [1, seqLen],
    );

    const encOutput = await enc.run({
      input_ids: inputIdsTensor,
      attention_mask: attentionMaskTensor,
    });

    const encoderHiddenStates = encOutput['last_hidden_state'] as Tensor;

    if (beamSize <= 1) {
      return this.greedyDecode(encoderHiddenStates, attentionMaskTensor, maxLength);
    }
    return this.beamSearchDecode(
      encoderHiddenStates,
      attentionMaskTensor,
      maxLength,
      beamSize,
      lengthPenalty,
    );
  }

  // ─── Greedy decode ─────────────────────────────────────────────────────────

  private async greedyDecode(
    encoderHiddenStates: Tensor,
    encoderAttentionMask: Tensor,
    maxLength: number,
  ): Promise<number[]> {
    const dec = this.decSession!;
    const tgtLangId = this.tokenizer.getTgtLangId();
    const generated: number[] = [tgtLangId];

    for (let step = 0; step < maxLength; step++) {
      const decInputIds = new ort.Tensor(
        'int64',
        BigInt64Array.from(generated.map(BigInt)),
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

      if (next === this.tokenizer.eosId) break;
    }

    return generated;
  }

  // ─── Beam search decode ────────────────────────────────────────────────────
  //
  // A reasonably faithful Hugging Face-style beam search:
  //   - Maintains `beamSize` active beams (with running log-prob sums)
  //   - At each step, expands every beam to the top-`beamSize` next tokens
  //   - Keeps the global top-`beamSize` candidates
  //   - Finished beams (hit EOS) are scored with length penalty
  //     (length ** alpha) and held aside
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
    const eosId = this.tokenizer.eosId;
    const tgtLangId = this.tokenizer.getTgtLangId();

    interface Beam { tokens: number[]; score: number; }
    let beams: Beam[] = [{ tokens: [tgtLangId], score: 0 }];
    const finished: Beam[] = [];

    for (let step = 0; step < maxLength; step++) {
      const candidates: Beam[] = [];

      for (const beam of beams) {
        const decInputIds = new ort.Tensor(
          'int64',
          BigInt64Array.from(beam.tokens.map(BigInt)),
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

        // Convert last-step logits to log-probs
        const logProbs = logSoftmax(data, offset, vocabSize);

        // Top-k expansion for this beam
        const topK = topKIndices(logProbs, beamSize);
        for (const idx of topK) {
          candidates.push({
            tokens: [...beam.tokens, idx],
            score: beam.score + logProbs[idx],
          });
        }
      }

      // Sort candidates by raw score, take top beamSize
      candidates.sort((a, b) => b.score - a.score);
      const next: Beam[] = [];

      for (const cand of candidates) {
        if (next.length >= beamSize) break;
        const lastTok = cand.tokens[cand.tokens.length - 1];
        if (lastTok === eosId) {
          finished.push(cand);
        } else {
          next.push(cand);
        }
      }

      beams = next;
      if (beams.length === 0) break;
    }

    // Add any unfinished beams to the candidate pool with EOS appended
    for (const beam of beams) {
      finished.push({ tokens: [...beam.tokens, eosId], score: beam.score });
    }

    // Length-normalised scoring: score / length^alpha
    const scored = finished.map((b) => ({
      beam: b,
      norm: b.score / Math.pow(b.tokens.length, lengthPenalty),
    }));
    scored.sort((a, b) => b.norm - a.norm);

    return scored[0]?.beam.tokens ?? [tgtLangId, eosId];
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
  // Numerically stable log-softmax
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
  // Min-heap of size k (kept simple — array of {idx, val})
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
  return heap
    .sort((a, b) => b.val - a.val)
    .map((h) => h.idx);
}

// ─── Singleton cache ──────────────────────────────────────────────────────────

const translatorCache = new Map<ModelDirection, OnnxTranslator>();

export function getTranslator(
  direction: ModelDirection,
  processor: IndicProcessor,
  tokenizer: BPETokenizer,
): OnnxTranslator {
  if (!translatorCache.has(direction)) {
    translatorCache.set(direction, new OnnxTranslator(processor, tokenizer));
  }
  return translatorCache.get(direction)!;
}

export function clearTranslatorCache(): void {
  for (const t of translatorCache.values()) {
    t.unload().catch(() => {});
  }
  translatorCache.clear();
}
