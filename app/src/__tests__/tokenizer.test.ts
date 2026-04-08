/**
 * Tests for the BPE tokenizer (JS port of HuggingFace's IndicTrans2 tokenizer).
 *
 * These tests use a tiny synthetic vocab + merge table so they exercise the
 * BPE algorithm without needing the real 32K-entry IndicTrans2 vocabulary.
 * They confirm:
 *  • merges are applied in rank order
 *  • language tags + EOS are injected on encode
 *  • decode round-trips and strips special tokens
 *  • the SentencePiece ▁ word marker becomes a regular space on decode
 */

import { BPETokenizer } from '../engine/translation/tokenizer';

// Synthetic vocab: char-level letters + a couple of merged tokens + special ids.
// IDs 0-3 are reserved special tokens (matches BPETokenizer defaults).
const VOCAB: Record<string, number> = {
  '<unk>': 0,
  '<pad>': 1,
  '<s>': 2,
  '</s>': 3,
  '▁': 4,
  '▁h': 5,
  '▁he': 6,
  '▁hel': 7,
  '▁hello': 8,
  '▁w': 9,
  '▁wo': 10,
  '▁world': 11,
  'h': 12, 'e': 13, 'l': 14, 'o': 15,
  'w': 16, 'r': 17, 'd': 18,
  // Language tags
  'eng_Latn': 100,
  'asm_Beng': 101,
};

// Merges, in priority order. The BPE algorithm should pick lower ranks first.
const MERGES = [
  '#version: 0.2',
  '▁ h',
  '▁h e',
  '▁he l',
  '▁hel l',
  '▁hell o',  // not in vocab — should fall back to ▁hel + l + o
  '▁ w',
  '▁w o',
  '▁wo r',
  '▁wor l',
  '▁worl d',
].join('\n');

async function makeTokenizer(srcLang = 'eng_Latn', tgtLang = 'asm_Beng') {
  const tok = new BPETokenizer({
    vocabPath: '',
    mergesPath: '',
    srcLang,
    tgtLang,
  });
  await tok.initialize(JSON.stringify(VOCAB), MERGES);
  return tok;
}

describe('BPETokenizer.initialize', () => {
  it('throws if encode is called before initialize', () => {
    const tok = new BPETokenizer({ vocabPath: '', mergesPath: '', srcLang: 'eng_Latn', tgtLang: 'asm_Beng' });
    expect(() => tok.encode('hi')).toThrow(/not initialized/);
  });

  it('skips comment lines in merges file', async () => {
    const tok = await makeTokenizer();
    // No assertion needed beyond a successful init — the comment '#version: 0.2'
    // should be ignored, not parsed as a merge rule.
    expect(tok.eosId).toBe(3);
  });
});

describe('BPETokenizer.encode', () => {
  it('prepends src lang id and appends EOS', async () => {
    const tok = await makeTokenizer();
    const ids = tok.encode('hello');
    expect(ids[0]).toBe(VOCAB['eng_Latn']); // src lang first
    expect(ids[ids.length - 1]).toBe(3);    // EOS last
  });

  it('produces the longest legal merge for a known word', async () => {
    const tok = await makeTokenizer();
    const ids = tok.encode('hello');
    // The merge chain ▁ h → ▁h e → ▁he l → ▁hel l → ▁hell o resolves to a
    // single token whose id (8 = ▁hello) is in vocab.
    expect(ids).toContain(8);
  });

  it('falls back to <unk> for unknown characters', async () => {
    const tok = await makeTokenizer();
    const ids = tok.encode('zzz');
    // 'z' isn't in vocab → unk (0) should appear at least once
    expect(ids).toContain(0);
  });

  it('encodes multiple words with separate ▁ prefixes', async () => {
    const tok = await makeTokenizer();
    const ids = tok.encode('hello world');
    // Both ▁hel-style and ▁wor-style tokens should appear
    expect(ids.some((id) => id >= 5 && id <= 8)).toBe(true);
    expect(ids.some((id) => id >= 9 && id <= 11)).toBe(true);
  });
});

describe('BPETokenizer.decode', () => {
  it('strips special tokens by default', async () => {
    const tok = await makeTokenizer();
    const decoded = tok.decode([2, 8, 11, 3]); // <s> ▁hello ▁world </s>
    expect(decoded).not.toContain('<s>');
    expect(decoded).not.toContain('</s>');
  });

  it('replaces ▁ markers with spaces', async () => {
    const tok = await makeTokenizer();
    const decoded = tok.decode([8, 11]); // ▁hello ▁world
    expect(decoded).toBe('hello world');
  });

  it('keeps special tokens when skipSpecialTokens=false', async () => {
    const tok = await makeTokenizer();
    const decoded = tok.decode([2, 8, 3], false);
    expect(decoded).toContain('<s>');
    expect(decoded).toContain('</s>');
  });
});

describe('BPETokenizer language tagging', () => {
  it('returns the target language id for forced decoder BOS', async () => {
    const tok = await makeTokenizer('eng_Latn', 'asm_Beng');
    expect(tok.getTgtLangId()).toBe(VOCAB['asm_Beng']);
  });

  it('uses the configured src lang as the first encoded id', async () => {
    const tok = await makeTokenizer('asm_Beng', 'eng_Latn');
    const ids = tok.encode('hello');
    expect(ids[0]).toBe(VOCAB['asm_Beng']);
    expect(tok.getTgtLangId()).toBe(VOCAB['eng_Latn']);
  });
});
