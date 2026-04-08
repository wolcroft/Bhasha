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
    name: 'Manipuri (Meitei script)',
    nativeName: 'ꯃꯤꯇꯩꯂꯣꯟ',
    script: 'Mtei',
    tier: 1,
    romanizedInput: true,
    neStates: ['Manipur'],
    hasBaseModel: true,
  },
  {
    // Many Manipuri speakers, especially in older texts and the Bengali-script
    // diaspora, write Meitei in Bengali script. Both code variants exist in
    // the IndicTrans2 distilled-200M dict (mni_Beng id 911, mni_Mtei id 6603)
    // and are supported by all three direction models out of the box.
    code: 'mni_Beng',
    name: 'Manipuri (Bengali script)',
    nativeName: 'মৈতৈলোন্',
    script: 'Beng',
    tier: 1,
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
    // Nagamese is the Assamese-based creole used as lingua franca across all
    // of Nagaland (~2M speakers, 16+ tribes). It is written in Latin script.
    // The IndicTrans2 dict has no nag_Latn embedding, so we reuse the
    // lus_Latn slot (id 32162) — the LoRA adapter is trained with that tag
    // and the tokenizer injects it. Mizo is moved to Tier 3 as a result.
    code: 'lus_Latn',
    name: 'Nagamese',
    nativeName: 'Nagamese',
    script: 'Latn',
    tier: 2,
    neStates: ['Nagaland'],
    hasBaseModel: true,
  },
  {
    code: 'kha_Latn',
    name: 'Khasi',
    nativeName: 'Khasi',
    script: 'Latn',
    tier: 2,
    neStates: ['Meghalaya'],
    hasBaseModel: true,
  },
  // Garo (grt_Latn) was originally planned for Tier-2 but dropped from v1:
  // AI4Bharat has no Garo data, the available bible/community corpora are
  // too small for a usable LoRA, and shipping a stub would mislead users.
  // Re-add when we have a real parallel corpus.

  // ─── Tier 3 — Blocked at the base-model level, listed as "coming soon" ───
  // None of these have a language-tag embedding in IndicTrans2's en-indic
  // dict, so even a LoRA cannot make them work — the base model has no
  // representation for them at all. They are listed (greyed out in the UI)
  // so users from Nagaland are not silently omitted.
  {
    // Mizo (lus_Latn) had its model slot reassigned to Nagamese — the lus_Latn
    // embedding (id 32162) is the only available Latin-script vacancy in the
    // IndicTrans2 dict and Nagamese has higher reach (Nagaland lingua franca,
    // ~2M speakers). Mizo stays listed here so Mizoram users are not omitted.
    // Re-enable when IndicTrans2 adds a dedicated slot, OR if a second
    // vacant Latin-script slot is found.
    code: 'lus_Latn_mizo',  // sentinel — not a real model code
    name: 'Mizo',
    nativeName: 'Mizo ṭawng',
    script: 'Latn',
    tier: 3,
    neStates: ['Mizoram'],
    hasBaseModel: false,
  },
  {
    code: 'njo_Latn',
    name: 'Ao Naga',
    nativeName: 'Ao',
    script: 'Latn',
    tier: 3,
    neStates: ['Nagaland'],
    hasBaseModel: false,
  },
  // Other Naga languages blocked the same way: Angami (njm), Lotha (njh),
  // Sema (nsm), Konyak (nbe). Add them once IndicTrans2 v3 / BPCC v3 ships
  // with Naga coverage, OR if we train a dedicated NMT from scratch.
];

/** Languages that have ONNX models bundled with the app and work today. */
export const SHIPPING_LANGUAGES: Language[] = LANGUAGES.filter((l) => l.tier === 1);

/** Languages listed in the picker but require future LoRA work. */
export const PLANNED_LANGUAGES: Language[] = LANGUAGES.filter((l) => l.tier === 2);

/** Languages listed as "coming soon" — blocked at the base-model level. */
export const FUTURE_LANGUAGES: Language[] = LANGUAGES.filter((l) => l.tier === 3);

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

/**
 * Language codes that use a dedicated LoRA-merged model bundle rather than
 * one of the three base direction bundles. Only English→LoRA is supported
 * in v1 (the reverse direction requires a separate indic-en LoRA adapter).
 */
const LORA_EN_TARGET_CODES = new Set(['lus_Latn', 'kha_Latn']);

export type ModelDirection =
  | 'en-indic'
  | 'indic-en'
  | 'indic-indic'
  | 'en-lus_Latn'
  | 'en-kha_Latn';

/** Returns the model bundle key for a given source/target language pair. */
export function getModelDirection(srcCode: string, tgtCode: string): ModelDirection {
  const srcIsEnglish = srcCode === 'eng_Latn';
  const tgtIsEnglish = tgtCode === 'eng_Latn';
  if (srcIsEnglish && LORA_EN_TARGET_CODES.has(tgtCode)) {
    return `en-${tgtCode}` as ModelDirection;
  }
  if (srcIsEnglish) return 'en-indic';
  if (tgtIsEnglish) return 'indic-en';
  return 'indic-indic';
}

/** Returns true if both languages have shipping support today. */
export function isPairSupported(srcCode: string, tgtCode: string): boolean {
  const src = getLanguage(srcCode);
  const tgt = getLanguage(tgtCode);
  if (!src?.hasBaseModel || !tgt?.hasBaseModel) return false;
  // LoRA-fine-tuned languages only have an English→X model (en-lus_Latn,
  // en-kha_Latn). There is no trained X→English or X→X LoRA — routing those
  // pairs to the base indic-en model would produce garbled output because
  // the base model has never seen those language codes on the source side.
  if (LORA_EN_TARGET_CODES.has(srcCode)) return false;
  if (LORA_EN_TARGET_CODES.has(tgtCode) && srcCode !== 'eng_Latn') return false;
  return true;
}
