/**
 * Tests for LanguagePack metadata + path helpers.
 *
 * The bundled-asset model means there are exactly three packs in v1.0:
 * en-indic, indic-en, and indic-indic. These tests guard the pack list and
 * the file-path helpers used by ModelManager and the BPE tokenizer loader.
 */

import {
  LANGUAGE_PACKS,
  getPackById,
  formatBytes,
  getPackDirectory,
  getEncoderPath,
  getDecoderPath,
  getVocabPath,
  getMergesPath,
} from '../models/LanguagePack';

describe('LANGUAGE_PACKS', () => {
  it('ships exactly three pack directions', () => {
    const ids = LANGUAGE_PACKS.map((p) => p.id).sort();
    expect(ids).toEqual(['en-indic', 'indic-en', 'indic-indic']);
  });

  it('every pack has a non-empty name and description', () => {
    for (const pack of LANGUAGE_PACKS) {
      expect(pack.name).toBeTruthy();
      expect(pack.description).toBeTruthy();
      expect(pack.installedSizeBytes).toBeGreaterThan(0);
      expect(pack.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('en-indic pack covers only English as the source', () => {
    const pack = getPackById('en-indic');
    expect(pack?.languageCodes).toEqual(['eng_Latn']);
  });

  it('indic-en pack covers all six Tier-1 NE Indic languages', () => {
    const pack = getPackById('indic-en');
    const expected = ['asm_Beng', 'ben_Beng', 'brx_Deva', 'mni_Mtei', 'npi_Deva', 'sat_Olck'];
    for (const code of expected) {
      expect(pack?.languageCodes).toContain(code);
    }
  });
});

describe('formatBytes', () => {
  it('formats bytes as KB below 1 MB', () => {
    expect(formatBytes(2048)).toBe('2 KB');
  });

  it('formats megabyte values', () => {
    expect(formatBytes(280 * 1024 * 1024)).toBe('280 MB');
  });

  it('formats gigabyte values with one decimal', () => {
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });
});

describe('path helpers', () => {
  it('builds paths under the document directory', () => {
    const dir = getPackDirectory('en-indic');
    expect(dir).toContain('models/en-indic');
  });

  it('encoder, decoder, vocab, merges all live in the same pack dir', () => {
    const dir = getPackDirectory('indic-en');
    expect(getEncoderPath('indic-en').startsWith(dir)).toBe(true);
    expect(getDecoderPath('indic-en').startsWith(dir)).toBe(true);
    expect(getVocabPath('indic-en').startsWith(dir)).toBe(true);
    expect(getMergesPath('indic-en').startsWith(dir)).toBe(true);
  });

  it('uses .txt for vocab (Metro asset workaround), not .json', () => {
    expect(getVocabPath('en-indic').endsWith('vocab.txt')).toBe(true);
    expect(getVocabPath('en-indic').endsWith('vocab.json')).toBe(false);
  });

  it('uses int8 quantized ONNX filenames', () => {
    expect(getEncoderPath('en-indic')).toContain('encoder_model_int8.onnx');
    expect(getDecoderPath('en-indic')).toContain('decoder_model_int8.onnx');
  });
});
