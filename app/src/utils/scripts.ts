/**
 * Script detection and basic transliteration utilities.
 * Used to detect the script of user-input text and route to the correct model.
 */

import type { Script } from './languages';

/** Unicode block ranges per script */
const SCRIPT_RANGES: { script: Script; from: number; to: number }[] = [
  { script: 'Deva', from: 0x0900, to: 0x097F },
  { script: 'Beng', from: 0x0980, to: 0x09FF },
  { script: 'Guru', from: 0x0A00, to: 0x0A7F },
  { script: 'Gujr', from: 0x0A80, to: 0x0AFF },
  { script: 'Orya', from: 0x0B00, to: 0x0B7F },
  { script: 'Taml', from: 0x0B80, to: 0x0BFF },
  { script: 'Telu', from: 0x0C00, to: 0x0C7F },
  { script: 'Knda', from: 0x0C80, to: 0x0CFF },
  { script: 'Mlym', from: 0x0D00, to: 0x0D7F },
  { script: 'Mtei', from: 0xABC0, to: 0xABFF },
  { script: 'Olck', from: 0x1C50, to: 0x1C7F },
  { script: 'Arab', from: 0x0600, to: 0x06FF },
];

/**
 * Detects the dominant script in a string by counting codepoints per script block.
 * Returns 'Latn' if no Indic/Arabic script is dominant.
 */
export function detectScript(text: string): Script {
  const counts: Partial<Record<Script, number>> = {};

  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    for (const range of SCRIPT_RANGES) {
      if (cp >= range.from && cp <= range.to) {
        counts[range.script] = (counts[range.script] ?? 0) + 1;
        break;
      }
    }
  }

  let maxScript: Script = 'Latn';
  let maxCount = 0;
  for (const [script, count] of Object.entries(counts) as [Script, number][]) {
    if (count > maxCount) {
      maxCount = count;
      maxScript = script;
    }
  }

  return maxScript;
}

/**
 * Returns true if the text contains characters from a right-to-left script.
 */
export function isRTL(text: string): boolean {
  const script = detectScript(text);
  return script === 'Arab';
}

/**
 * Normalises Devanagari nukta variations to a canonical form.
 * IndicTrans2 expects normalised Unicode before tokenisation.
 */
export function normaliseDevanagari(text: string): string {
  return text
    .normalize('NFC')
    // Normalise Zero Width Non-Joiner / Zero Width Joiner
    .replace(/\u200C/g, '')  // Remove ZWNJ where not needed
    .trim();
}

/**
 * Simple heuristic: returns true if the string is likely romanised Indic
 * (Latin script but containing common romanisation patterns for Indic languages).
 */
export function isLikelyRomanisedIndic(text: string): boolean {
  const script = detectScript(text);
  if (script !== 'Latn') return false;

  // Common romanised Indic patterns
  const patterns = [
    /\b(namaskar|namaste|dhanyavad|aap|hain|hai|mein|main|kya|kaise)\b/i,
    /\b(ami|tumi|apni|ki|kori|ache|thakbo)\b/i,  // Bengali romanised
    /\b(naan|neenga|enna|epdi|sollu|vanga)\b/i,    // Tamil romanised
  ];

  return patterns.some((p) => p.test(text));
}
