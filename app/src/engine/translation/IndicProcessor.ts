/**
 * IndicProcessor — script-normalization + sentence-splitting helper.
 *
 * Tokenization moved into the ONNX tokenizer graph (see ./tokenizer.ts) so
 * this module's only job now is the parts of AI4Bharat's IndicProcessor that
 * are still done JS-side: Unicode normalization for the writing system and
 * splitting long inputs into translatable chunks.
 */

import { normalizeScript, splitSentences } from './scriptNormalizer';

export class IndicProcessor {
  /** Apply language-aware Unicode normalization to a single sentence. */
  normalize(text: string, srcLang: string): string {
    return normalizeScript(text, srcLang);
  }

  /**
   * Break a long input into sentence-sized chunks. IndicTrans2 produces best
   * results when each forward pass sees ≤512 source tokens; sentence splitting
   * is the cheapest way to stay under that.
   */
  splitIntoSentences(text: string, srcLang: string): string[] {
    return splitSentences(text, srcLang);
  }
}
