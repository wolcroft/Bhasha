/**
 * Tests for script normalisation — the first step of IndicTrans2 preprocessing.
 *
 * Bhasha ships NE languages that span Latin, Bengali (Assamese), Devanagari
 * (Bodo, Nepali), Meitei, and Ol Chiki scripts. The normalizer must produce
 * stable output for each so the tokenizer sees the same canonical form
 * regardless of how the user typed/pasted the text.
 */

import {
  normalizeScript,
  splitSentences,
  addLanguageTags,
} from '../engine/translation/scriptNormalizer';

describe('normalizeScript — Unicode + whitespace', () => {
  it('collapses repeated whitespace', () => {
    expect(normalizeScript('hello    world', 'eng_Latn')).toBe('hello world');
  });

  it('strips zero-width and BOM characters', () => {
    expect(normalizeScript('hi\u200B there\uFEFF', 'eng_Latn')).toBe('hi there');
    expect(normalizeScript('foo\u200Cbar', 'eng_Latn')).toBe('foobar');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeScript('   hello   ', 'eng_Latn')).toBe('hello');
  });

  it('applies Unicode NFC normalisation', () => {
    // U+00E9 (é) should equal NFC of "e + combining acute"
    const decomposed = 'e\u0301';
    expect(normalizeScript(decomposed, 'eng_Latn')).toBe('é');
  });
});

describe('normalizeScript — Devanagari (Bodo, Nepali)', () => {
  it('converts ASCII digits to Devanagari numerals', () => {
    expect(normalizeScript('मेरी उम्र 25 साल है', 'npi_Deva')).toContain('२५');
  });

  it('normalises chandrabindu to anusvara', () => {
    const input = 'हँसी';
    const out = normalizeScript(input, 'npi_Deva');
    expect(out).not.toContain('ँ');
    expect(out).toContain('ं');
  });
});

describe('normalizeScript — Bengali (Assamese, Bengali)', () => {
  it('expands khanda ta to its decomposed form', () => {
    // Khanda ta U+09CE → U+09A4 + U+09CD
    const input = 'কৎ';
    const out = normalizeScript(input, 'asm_Beng');
    expect(out).not.toContain('\u09CE');
  });

  it('preserves regular Bengali text', () => {
    const input = 'আমি ভাত খাই';
    expect(normalizeScript(input, 'asm_Beng')).toBe('আমি ভাত খাই');
  });
});

describe('normalizeScript — leaves unsupported scripts mostly intact', () => {
  it('does not damage Meitei (Mtei) text', () => {
    const input = 'ꯃꯤꯇꯩꯂꯣꯟ';
    expect(normalizeScript(input, 'mni_Mtei')).toBe(input);
  });

  it('does not damage Ol Chiki (Olck) text', () => {
    const input = 'ᱥᱟᱱᱛᱟᱲᱤ';
    expect(normalizeScript(input, 'sat_Olck')).toBe(input);
  });
});

describe('splitSentences', () => {
  it('splits English on punctuation followed by capital', () => {
    const sentences = splitSentences('Hello world. How are you? I am fine.', 'eng_Latn');
    expect(sentences.length).toBeGreaterThanOrEqual(2);
  });

  it('splits Devanagari on the danda mark', () => {
    const sentences = splitSentences('मेरा नाम राम है। मैं नेपाल से हूँ।', 'npi_Deva');
    expect(sentences.length).toBe(2);
  });

  it('splits Bengali on the danda mark', () => {
    const sentences = splitSentences('আমি ভাত খাই। তুমি কী খাও।', 'asm_Beng');
    expect(sentences.length).toBe(2);
  });

  it('returns the whole text when no boundary is found', () => {
    expect(splitSentences('hello world', 'eng_Latn')).toEqual(['hello world']);
  });

  it('drops empty sentence fragments', () => {
    const sentences = splitSentences('foo।  ।bar।', 'npi_Deva');
    for (const s of sentences) {
      expect(s.length).toBeGreaterThan(0);
    }
  });
});

describe('addLanguageTags', () => {
  it('returns the text unchanged (tags injected at tokenizer level)', () => {
    expect(addLanguageTags('hello', 'eng_Latn', 'asm_Beng')).toBe('hello');
  });
});
