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
  FUTURE_LANGUAGES,
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

  it('contains exactly the seven tier-1 NE languages plus English', () => {
    const expected = [
      'eng_Latn',
      'asm_Beng', 'ben_Beng', 'brx_Deva',
      'mni_Mtei', 'mni_Beng', 'npi_Deva', 'sat_Olck',
    ];
    const actual = SHIPPING_LANGUAGES.map((l) => l.code).sort();
    expect(actual).toEqual(expected.sort());
  });

  it('exposes Manipuri in both Meitei and Bengali scripts', () => {
    const mtei = getLanguage('mni_Mtei');
    const beng = getLanguage('mni_Beng');
    expect(mtei?.tier).toBe(1);
    expect(beng?.tier).toBe(1);
    expect(mtei?.hasBaseModel).toBe(true);
    expect(beng?.hasBaseModel).toBe(true);
    expect(mtei?.neStates).toContain('Manipur');
    expect(beng?.neStates).toContain('Manipur');
  });

  it('covers Nagaland — Nagamese as Tier-2, Ao Naga as Tier-3', () => {
    const nagamese = getLanguage('lus_Latn');
    expect(nagamese?.name).toBe('Nagamese');
    expect(nagamese?.tier).toBe(2);
    expect(nagamese?.neStates).toContain('Nagaland');

    const ao = getLanguage('njo_Latn');
    expect(ao?.tier).toBe(3);
    expect(ao?.neStates).toContain('Nagaland');
  });

  it('lists Nagamese and Khasi as Tier-2 (LoRA fine-tuned)', () => {
    const tier2Codes = PLANNED_LANGUAGES.map((l) => l.code).sort();
    expect(tier2Codes).toEqual(['kha_Latn', 'lus_Latn']);
    const nagamese = PLANNED_LANGUAGES.find((l) => l.code === 'lus_Latn');
    expect(nagamese?.name).toBe('Nagamese');
    expect(nagamese?.neStates).toContain('Nagaland');
    // Both LoRA adapters are trained — hasBaseModel true for both
    expect(nagamese?.hasBaseModel).toBe(true);
    const khasi = PLANNED_LANGUAGES.find((l) => l.code === 'kha_Latn');
    expect(khasi?.hasBaseModel).toBe(true);
  });

  it('does not list Garo (dropped from v1 — no usable parallel corpus)', () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(codes).not.toContain('grt_Latn');
  });

  it('lists Mizo as Tier-3 (slot reassigned to Nagamese)', () => {
    const mizo = FUTURE_LANGUAGES.find((l) => l.name === 'Mizo');
    expect(mizo).toBeDefined();
    expect(mizo?.tier).toBe(3);
    expect(mizo?.neStates).toContain('Mizoram');
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
    expect(beng).toEqual(['asm_Beng', 'ben_Beng', 'mni_Beng']);
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

  it('routes English → LoRA languages to their dedicated bundles', () => {
    expect(getModelDirection('eng_Latn', 'lus_Latn')).toBe('en-lus_Latn');
    expect(getModelDirection('eng_Latn', 'kha_Latn')).toBe('en-kha_Latn');
  });
});

describe('isPairSupported', () => {
  it('accepts tier-1 ↔ tier-1 pairs', () => {
    expect(isPairSupported('eng_Latn', 'asm_Beng')).toBe(true);
    expect(isPairSupported('asm_Beng', 'mni_Mtei')).toBe(true);
  });

  it('accepts English → Nagamese (LoRA trained forward direction)', () => {
    expect(isPairSupported('eng_Latn', 'lus_Latn')).toBe(true);
  });

  it('rejects Nagamese → English (no reverse indic-en LoRA trained)', () => {
    expect(isPairSupported('lus_Latn', 'eng_Latn')).toBe(false);
  });

  it('rejects Nagamese → other Indic (no reverse LoRA)', () => {
    expect(isPairSupported('lus_Latn', 'asm_Beng')).toBe(false);
  });

  it('accepts English → Khasi (LoRA trained forward direction)', () => {
    expect(isPairSupported('eng_Latn', 'kha_Latn')).toBe(true);
  });

  it('rejects Khasi → English (no reverse indic-en LoRA trained)', () => {
    expect(isPairSupported('kha_Latn', 'eng_Latn')).toBe(false);
  });

  it('rejects Khasi → other Indic (no reverse LoRA)', () => {
    expect(isPairSupported('kha_Latn', 'asm_Beng')).toBe(false);
  });

  it('rejects unknown language codes', () => {
    expect(isPairSupported('eng_Latn', 'xyz_Zzzz')).toBe(false);
  });
});
