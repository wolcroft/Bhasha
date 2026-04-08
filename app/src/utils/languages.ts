/**
 * Language metadata — NORTHEAST INDIA FOCUS
 * ==========================================
 * Bhasha v1.0 ships only the languages of the eight Northeast Indian states:
 *   Assam, Arunachal Pradesh, Manipur, Meghalaya, Mizoram, Nagaland, Tripura, Sikkim.
 *
 * Codes use the IndicTrans2 / Flores-200 format: <iso639>_<script>
 *
 * Tier definitions:
 *   1 — IndicTrans2 native support, ships on day one
 *   2 — Needs LoRA fine-tuning, listed but greyed out until pack arrives
 *   3 — Future / corpus-building, not exposed in UI
 */

export type Script =
  | 'Latn'
  | 'Deva'
  | 'Beng'
  | 'Mtei'
  | 'Olck';

export type NEState =
  | 'Assam'
  | 'Arunachal Pradesh'
  | 'Manipur'
  | 'Meghalaya'
  | 'Mizoram'
  | 'Nagaland'
  | 'Tripura'
  | 'Sikkim';

export interface Language {
  code: string;          // IndicTrans2 / Flores-200 code, e.g. "asm_Beng"
  name: string;          // English name
  nativeName: string;    // Name in the language itself
  script: Script;
  tier: 1 | 2 | 3;
  rtl?: boolean;
  romanizedInput?: boolean;
  /** Northeast Indian states where the language is primarily spoken */
  neStates?: NEState[];
  /** Whether IndicTrans2's distilled-200M base supports this language */
  hasBaseModel: boolean;
}

/**
 * The Northeast language list. English is included as a translation pivot.
 */
export const LANGUAGES: Language[] = [
  // ─── English (translation pivot, always available) ───────────────────────
  {
    code: 'eng_Latn',
    name: 'English',
    nativeName: 'English',
    script: 'Latn',
    tier: 1,
    hasBaseModel: true,
  },

  // ─── Tier 1 — IndicTrans2 native support ─────────────────────────────────
  {
    code: 'asm_Beng',
    name: 'Assamese',
    nativeName: 'অসমীয়া',
    script: 'Beng',
    tier: 1,
    neStates: ['Assam'],
    hasBaseModel: true,
  },
  {
    code: 'ben_Beng',
    name: 'Bengali',
    nativeName: 'বাংলা',
    script: 'Beng',
    tier: 1,
    // Bengali is the principal language of Tripura and a major language in
    // the Barak Valley of Assam.
    neStates: ['Tripura', 'Assam'],
    hasBaseModel: true,
  },
  {
    code: 'brx_Deva',
    name: 'Bodo',
    nativeName: 'बड़ो',
    script: 'Deva',
    tier: 1,
    neStates: ['Assam'],
    hasBaseModel: true,
  },
  {
    code: 'mni_Mtei',
    name: 'Manipuri',
    nativeName: 'ꯃꯤꯇꯩꯂꯣꯟ',
    script: 'Mtei',
    tier: 1,
    romanizedInput: true,
    neStates: ['Manipur'],
    hasBaseModel: true,
  },
  {
    code: 'npi_Deva',
    name: 'Nepali',
    nativeName: 'नेपाली',
    script: 'Deva',
    tier: 1,
    neStates: ['Sikkim'],
    hasBaseModel: true,
  },
  {
    code: 'sat_Olck',
    name: 'Santali',
    nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ',
    script: 'Olck',
    tier: 1,
    romanizedInput: true,
    // Spoken in Assam tea garden communities and parts of NE
    neStates: ['Assam'],
    hasBaseModel: true,
  },

  // ─── Tier 2 — Need LoRA fine-tuning, listed but flagged ──────────────────
  {
    code: 'lus_Latn',
    name: 'Mizo',
    nativeName: 'Mizo ṭawng',
    script: 'Latn',
    tier: 2,
    neStates: ['Mizoram'],
    hasBaseModel: false,
  },
  {
    code: 'kha_Latn',
    name: 'Khasi',
    nativeName: 'Khasi',
    script: 'Latn',
    tier: 2,
    neStates: ['Meghalaya'],
    hasBaseModel: false,
  },
  // Garo (grt_Latn) was originally planned for Tier-2 but dropped from v1:
  // AI4Bharat has no Garo data, the available bible/community corpora are
  // too small for a usable LoRA, and shipping a stub would mislead users.
  // Re-add when we have a real parallel corpus.
];

/** Languages that have ONNX models bundled with the app and work today. */
export const SHIPPING_LANGUAGES: Language[] = LANGUAGES.filter((l) => l.tier === 1);

/** Languages listed in the picker but require future LoRA work. */
export const PLANNED_LANGUAGES: Language[] = LANGUAGES.filter((l) => l.tier === 2);

export function getLanguage(code: string): Language | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

export function getLanguagesByScript(script: Script): Language[] {
  return SHIPPING_LANGUAGES.filter((l) => l.script === script);
}

/** Groups Tier 1 languages by script family for the language picker UI. */
export function getLanguageGroups(): { script: Script; label: string; languages: Language[] }[] {
  const groups: { script: Script; label: string; languages: Language[] }[] = [
    { script: 'Latn', label: 'Latin', languages: [] },
    { script: 'Beng', label: 'Bengali / Assamese', languages: [] },
    { script: 'Deva', label: 'Devanagari', languages: [] },
    { script: 'Mtei', label: 'Meitei', languages: [] },
    { script: 'Olck', label: 'Ol Chiki', languages: [] },
  ];

  for (const lang of SHIPPING_LANGUAGES) {
    const group = groups.find((g) => g.script === lang.script);
    if (group) group.languages.push(lang);
  }

  return groups.filter((g) => g.languages.length > 0);
}

/** Returns the model direction key for a given source/target language pair. */
export function getModelDirection(srcCode: string, tgtCode: string): 'en-indic' | 'indic-en' | 'indic-indic' {
  const srcIsEnglish = srcCode === 'eng_Latn';
  const tgtIsEnglish = tgtCode === 'eng_Latn';
  if (srcIsEnglish) return 'en-indic';
  if (tgtIsEnglish) return 'indic-en';
  return 'indic-indic';
}

/** Returns true if both languages have shipping support today. */
export function isPairSupported(srcCode: string, tgtCode: string): boolean {
  const src = getLanguage(srcCode);
  const tgt = getLanguage(tgtCode);
  return Boolean(src?.hasBaseModel && tgt?.hasBaseModel);
}
