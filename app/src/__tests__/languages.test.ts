/**
 * Tests for the Northeast-India language list and its helpers.
 *
 * Bhasha v1.0 ships only NE languages, so these tests double as a guardrail
 * against accidental scope creep — adding a non-NE language to LANGUAGES
 * should be a deliberate decision, not a copy-paste accident.
 */

import {
  LANGUAGES,
  SHIPPING_LANGUAGES,
  PLANNED_LANGUAGES,
  getLanguage,
  getLanguagesByScript,
  getLanguageGroups,
  getModelDirection,
  isPairSupported,
  type NEState,
} from '../utils/languages';

describe('Northeast language list', () => {
  it('includes English as a translation pivot', () => {
    expect(getLanguage('eng_Latn')).toBeDefined();
    expect(getLanguage('eng_Latn')?.tier).toBe(1);
    expect(getLanguage('eng_Latn')?.hasBaseModel).toBe(true);
  });

  it('contains exactly the six tier-1 NE languages plus English', () => {
    const expected = [
      'eng_Latn',
      'asm_Beng', 'ben_Beng', 'brx_Deva',
      'mni_Mtei', 'npi_Deva', 'sat_Olck',
    ];
    const actual = SHIPPING_LANGUAGES.map((l) => l.code).sort();
    expect(actual).toEqual(expected.sort());
  });

  it('lists Mizo, Khasi, and Garo as Tier-2 (planned)', () => {
    const tier2Codes = PLANNED_LANGUAGES.map((l) => l.code).sort();
    expect(tier2Codes).toEqual(['grt_Latn', 'kha_Latn', 'lus_Latn']);
    for (const lang of PLANNED_LANGUAGES) {
      expect(lang.hasBaseModel).toBe(false);
    }
  });

  it('does not include any non-NE Indic languages (e.g. Tamil, Telugu, Hindi)', () => {
    const codes = LANGUAGES.map((l) => l.code);
    const banned = ['tam_Taml', 'tel_Telu', 'hin_Deva', 'kan_Knda', 'mar_Deva'];
    for (const code of banned) {
      expect(codes).not.toContain(code);
    }
  });

  it('every non-English language is tagged with at least one NE state', () => {
    const validStates: NEState[] = [
      'Assam', 'Arunachal Pradesh', 'Manipur', 'Meghalaya',
      'Mizoram', 'Nagaland', 'Tripura', 'Sikkim',
    ];
    for (const lang of LANGUAGES) {
      if (lang.code === 'eng_Latn') continue;
      expect(lang.neStates).toBeDefined();
      expect(lang.neStates!.length).toBeGreaterThan(0);
      for (const state of lang.neStates!) {
        expect(validStates).toContain(state);
      }
    }
  });

  it('groups languages by script for the picker UI', () => {
    const groups = getLanguageGroups();
    const labels = groups.map((g) => g.label);
    expect(labels).toContain('Latin');
    expect(labels).toContain('Bengali / Assamese');
    expect(labels).toContain('Devanagari');
    expect(labels).toContain('Meitei');
    expect(labels).toContain('Ol Chiki');
    // Each group must have ≥1 language
    for (const g of groups) {
      expect(g.languages.length).toBeGreaterThan(0);
    }
  });

  it('getLanguagesByScript filters correctly', () => {
    const beng = getLanguagesByScript('Beng').map((l) => l.code).sort();
    expect(beng).toEqual(['asm_Beng', 'ben_Beng']);
  });
});

describe('getModelDirection', () => {
  it('routes English → Indic to en-indic', () => {
    expect(getModelDirection('eng_Latn', 'asm_Beng')).toBe('en-indic');
  });

  it('routes Indic → English to indic-en', () => {
    expect(getModelDirection('mni_Mtei', 'eng_Latn')).toBe('indic-en');
  });

  it('routes Indic → Indic to indic-indic', () => {
    expect(getModelDirection('asm_Beng', 'mni_Mtei')).toBe('indic-indic');
    expect(getModelDirection('ben_Beng', 'sat_Olck')).toBe('indic-indic');
  });
});

describe('isPairSupported', () => {
  it('accepts tier-1 ↔ tier-1 pairs', () => {
    expect(isPairSupported('eng_Latn', 'asm_Beng')).toBe(true);
    expect(isPairSupported('asm_Beng', 'mni_Mtei')).toBe(true);
  });

  it('rejects pairs that involve a tier-2 language', () => {
    expect(isPairSupported('eng_Latn', 'lus_Latn')).toBe(false);
    expect(isPairSupported('kha_Latn', 'eng_Latn')).toBe(false);
    expect(isPairSupported('grt_Latn', 'asm_Beng')).toBe(false);
  });

  it('rejects unknown language codes', () => {
    expect(isPairSupported('eng_Latn', 'xyz_Zzzz')).toBe(false);
  });
});
