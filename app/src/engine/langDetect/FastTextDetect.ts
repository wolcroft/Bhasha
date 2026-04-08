/**
 * FastText Language Detection
 *
 * Uses a compressed fastText model (lid.176.ftz, ~1MB) to detect the language
 * of input text. The model is loaded from the app's local file system after
 * download, or falls back to script-based heuristic detection.
 *
 * Note: react-native-executorch does not yet ship a fastText module.
 * We use a lightweight pure-JS heuristic detection layer here, with the
 * fastText model inference planned via a future native module bridge.
 */

import { detectScript } from '@/utils/scripts';
import type { Language } from '@/utils/languages';
import { LANGUAGES } from '@/utils/languages';

export interface DetectionResult {
  langCode: string;   // e.g. "hin_Deva"
  confidence: number; // 0–1
  method: 'heuristic' | 'fasttext';
}

/**
 * Detect the language of the input text.
 * Uses script detection heuristics as a primary fast path,
 * and will delegate to fastText native module when available.
 */
export async function detectLanguage(text: string): Promise<DetectionResult> {
  if (!text || text.trim().length < 3) {
    return { langCode: 'eng_Latn', confidence: 0.5, method: 'heuristic' };
  }

  // Script-based detection first (fast path)
  const script = detectScript(text.trim());

  if (script === 'Latn') {
    // Could be English, Mizo, Khasi, Garo, or Romanised Indic
    // For Latin, default to English unless we have more signals
    return { langCode: 'eng_Latn', confidence: 0.85, method: 'heuristic' };
  }

  // Map script to likely languages
  const scriptToLang: Record<string, string> = {
    Deva: 'hin_Deva',
    Beng: 'ben_Beng',
    Taml: 'tam_Taml',
    Telu: 'tel_Telu',
    Knda: 'kan_Knda',
    Mlym: 'mal_Mlym',
    Gujr: 'guj_Gujr',
    Guru: 'pan_Guru',
    Orya: 'ory_Orya',
    Arab: 'urd_Arab',   // Could also be Kashmiri or Sindhi
    Mtei: 'mni_Mtei',
    Olck: 'sat_Olck',
  };

  const langCode = scriptToLang[script] ?? 'eng_Latn';
  return { langCode, confidence: 0.75, method: 'heuristic' };
}

/**
 * Detect the most likely source language from a set of candidates.
 * Used when the user has pre-selected possible languages.
 */
export async function detectFromCandidates(
  text: string,
  candidates: Language[],
): Promise<DetectionResult> {
  const result = await detectLanguage(text);
  const match = candidates.find((c) => c.code === result.langCode);
  if (match) return result;

  // Fallback: return first candidate with lower confidence
  return { langCode: candidates[0].code, confidence: 0.4, method: 'heuristic' };
}
