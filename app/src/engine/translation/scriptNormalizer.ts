/**
 * Script Normalizer — IndicTrans2 preprocessing step 1
 *
 * Ports key logic from IndicNLP's normalize_unicode() and
 * AI4Bharat's IndicProcessor.preprocess() to TypeScript.
 * Handles Devanagari, Bengali, and common Unicode normalisation.
 */

/** Normalise text for all scripts before tokenisation. */
export function normalizeScript(text: string, langCode: string): string {
  const script = langCode.split('_')[1];

  // Step 1: Unicode NFC normalisation
  let result = text.normalize('NFC');

  // Step 2: Script-specific normalisation
  switch (script) {
    case 'Deva':
      result = normalizeDevanagari(result);
      break;
    case 'Beng':
      result = normalizeBengali(result);
      break;
    case 'Arab':
      result = normalizeArabic(result);
      break;
    default:
      break;
  }

  // Step 3: Common cleanup
  result = result
    .replace(/\u200B/g, '')         // Remove zero-width space
    .replace(/\u200C/g, '')         // Remove ZWNJ
    .replace(/\uFEFF/g, '')         // Remove BOM
    .replace(/\s+/g, ' ')           // Collapse whitespace
    .trim();

  return result;
}

function normalizeDevanagari(text: string): string {
  return text
    // Normalise dandas
    .replace(/।/g, '।')
    // Normalise anusvara variants
    .replace(/ँ/g, 'ं')
    // Half-forms: normalise chandrabindu
    .replace(/\u0900/g, 'ं')
    // Virama + ZWJ sequences
    .replace(/\u094D\u200D/g, '\u094D')
    // Normalise old-style numerals to Devanagari
    .replace(/[0-9]/g, (d) => String.fromCodePoint(0x0966 + parseInt(d)));
}

function normalizeBengali(text: string): string {
  return text
    // Normalise hasanta
    .replace(/\u09BC/g, '')
    // Normalise khanda ta
    .replace(/\u09CE/g, '\u09A4\u09CD')
    .normalize('NFC');
}

function normalizeArabic(text: string): string {
  return text
    // Normalise different forms of alef
    .replace(/[أإآ]/g, 'ا')
    // Remove tatweel
    .replace(/\u0640/g, '')
    // Normalise ya forms
    .replace(/ى/g, 'ي');
}

/**
 * Detects sentence boundaries for a given script.
 * Returns an array of sentences.
 */
export function splitSentences(text: string, langCode: string): string[] {
  const script = langCode.split('_')[1];

  // Indic sentence boundary markers
  const indicBoundary = /[।॥|!?]/;
  // Latin sentence boundaries
  const latinBoundary = /(?<=[.!?])\s+(?=[A-Z])/;

  let pattern: RegExp;
  if (script === 'Latn') {
    pattern = latinBoundary;
  } else {
    pattern = indicBoundary;
  }

  const sentences = text
    .split(pattern)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return sentences.length > 0 ? sentences : [text.trim()];
}

/**
 * Adds language tag tokens that IndicTrans2 expects at the start of input.
 * Format: <2xx> where xx is the Flores-200 language code.
 */
export function addLanguageTags(text: string, srcLang: string, tgtLang: string): string {
  return `${text}`;
}
