/**
 * Tests for IndicProcessor — the batching/padding wrapper around BPETokenizer
 * that bridges raw user text and the ONNX encoder input tensors.
 */

import { BPETokenizer } from '../engine/translation/tokenizer';
import { IndicProcessor } from '../engine/translation/IndicProcessor';

const VOCAB: Record<string, number> = {
  '<unk>': 0, '<pad>': 1, '<s>': 2, '</s>': 3,
  '▁': 4, '▁a': 5, '▁ab': 6, '▁abc': 7,
  '▁x': 8, '▁xy': 9,
  'eng_Latn': 100, 'asm_Beng': 101,
  'a': 10, 'b': 11, 'c': 12, 'x': 13, 'y': 14,
};

const MERGES = ['▁ a', '▁a b', '▁ab c', '▁ x', '▁x y'].join('\n');

async function makeProcessor() {
  const tok = new BPETokenizer({
    vocabPath: '', mergesPath: '', srcLang: 'eng_Latn', tgtLang: 'asm_Beng',
  });
  await tok.initialize(JSON.stringify(VOCAB), MERGES);
  return new IndicProcessor(tok);
}

describe('IndicProcessor.preprocess', () => {
  it('produces equal-length input ids and attention masks', async () => {
    const proc = await makeProcessor();
    const batch = proc.preprocess(['abc', 'xy'], 'eng_Latn', 'asm_Beng');
    expect(batch.inputIds.length).toBe(2);
    expect(batch.attentionMasks.length).toBe(2);
    for (const row of batch.inputIds) {
      expect(row.length).toBe(batch.paddedLength);
    }
    for (const row of batch.attentionMasks) {
      expect(row.length).toBe(batch.paddedLength);
    }
  });

  it('pads shorter sequences with the pad token id', async () => {
    const proc = await makeProcessor();
    // 'abc' is the longer sentence; 'xy' should be padded
    const batch = proc.preprocess(['abc abc', 'xy'], 'eng_Latn', 'asm_Beng');
    const shorterRow = batch.inputIds[1];
    const shorterMask = batch.attentionMasks[1];

    // Last token of the shorter row must be the pad id (1)
    expect(shorterRow[shorterRow.length - 1]).toBe(1);
    // The mask must be 0 wherever the row is padding
    expect(shorterMask[shorterMask.length - 1]).toBe(0);
    // The mask must start with 1s for real tokens
    expect(shorterMask[0]).toBe(1);
  });

  it('attention mask sums equal real-token counts', async () => {
    const proc = await makeProcessor();
    const batch = proc.preprocess(['abc', 'xy abc'], 'eng_Latn', 'asm_Beng');
    for (let i = 0; i < batch.inputIds.length; i++) {
      const realTokens = batch.inputIds[i].filter((id) => id !== 1).length;
      const maskSum = batch.attentionMasks[i].reduce((s, v) => s + v, 0);
      expect(maskSum).toBe(realTokens);
    }
  });

  it('runs the script normaliser before tokenising', async () => {
    const proc = await makeProcessor();
    // Extra whitespace should be collapsed by normalizeScript before encoding
    const a = proc.preprocess(['abc'], 'eng_Latn', 'asm_Beng');
    const b = proc.preprocess(['  abc   '], 'eng_Latn', 'asm_Beng');
    expect(a.inputIds[0]).toEqual(b.inputIds[0]);
  });
});

describe('IndicProcessor.postprocess', () => {
  it('decodes ids back into trimmed text', async () => {
    const proc = await makeProcessor();
    // [<s>, ▁abc, </s>] → "abc"
    const text = proc.postprocess([2, 7, 3]);
    expect(text).toBe('abc');
  });

  it('drops trailing whitespace', async () => {
    const proc = await makeProcessor();
    expect(proc.postprocess([7]).endsWith(' ')).toBe(false);
  });
});

describe('IndicProcessor.splitIntoSentences', () => {
  it('splits a multi-sentence Devanagari string on the danda', async () => {
    const proc = await makeProcessor();
    const sents = proc.splitIntoSentences('मेरा नाम राम है। मैं नेपाल से हूँ।', 'npi_Deva');
    expect(sents.length).toBe(2);
  });

  it('returns the original text when no boundary is present', async () => {
    const proc = await makeProcessor();
    expect(proc.splitIntoSentences('hello', 'eng_Latn')).toEqual(['hello']);
  });
});
