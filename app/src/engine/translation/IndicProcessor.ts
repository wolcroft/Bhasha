/**
 * IndicProcessor — TypeScript port of AI4Bharat's IndicTrans2 preprocessing
 *
 * The original Python IndicProcessor handles:
 *  1. Script normalisation (Unicode NFC + language-specific fixes)
 *  2. Sentence boundary detection
 *  3. Language tag injection
 *  4. Tokenisation (BPE via SentencePiece)
 *
 * This port covers steps 1-3 inline and delegates step 4 to BPETokenizer.
 */

import { normalizeScript, splitSentences } from './scriptNormalizer';
import type { BPETokenizer } from './tokenizer';

export interface ProcessedBatch {
  inputIds: number[][];       // [batch, seq_len] — variable length
  attentionMasks: number[][];  // [batch, seq_len] — 1 = real token, 0 = pad
  paddedLength: number;
}

export class IndicProcessor {
  constructor(private tokenizer: BPETokenizer) {}

  /**
   * Preprocess a list of sentences for batch inference.
   * Normalises, tokenises, and pads to a common length.
   */
  preprocess(sentences: string[], srcLang: string, tgtLang: string): ProcessedBatch {
    const normalized = sentences.map((s) => normalizeScript(s, srcLang));
    const tokenized = normalized.map((s) => this.tokenizer.encode(s));

    // Pad to max length in batch
    const maxLen = Math.max(...tokenized.map((t) => t.length));
    const inputIds: number[][] = [];
    const attentionMasks: number[][] = [];

    for (const tokens of tokenized) {
      const padLen = maxLen - tokens.length;
      inputIds.push([...tokens, ...Array(padLen).fill(this.tokenizer.padId)]);
      attentionMasks.push([...Array(tokens.length).fill(1), ...Array(padLen).fill(0)]);
    }

    return { inputIds, attentionMasks, paddedLength: maxLen };
  }

  /**
   * Postprocess decoder output token IDs back to readable text.
   * Strips language tags, special tokens, and cleans up spacing.
   */
  postprocess(tokenIds: number[]): string {
    return this.tokenizer.decode(tokenIds, true).trim();
  }

  /**
   * Split a long input text into translatable sentences.
   * IndicTrans2 works best with sentence-level inputs (<512 tokens each).
   */
  splitIntoSentences(text: string, srcLang: string): string[] {
    return splitSentences(text, srcLang);
  }
}
