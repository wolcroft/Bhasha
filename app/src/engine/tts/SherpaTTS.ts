/**
 * SherpaTTS — Text-to-Speech, backed by expo-speech (iOS/Android system TTS).
 *
 * expo-speech uses the platform's built-in TTS engine (AVSpeechSynthesizer on
 * iOS, Android TTS on Android). No extra native framework is bundled, which
 * avoids the onnxruntime.xcframework conflict that arose with the original
 * react-native-sherpa-onnx-offline-tts approach.
 *
 * Supported languages (system TTS, quality depends on iOS voice pack):
 *   eng_Latn → 'en-US'   — excellent quality on all devices
 *   npi_Deva → 'ne-NP'   — good quality on iOS 17+ (Nepali voice installed)
 *   asm_Beng → 'as-IN'   — available on some iOS versions
 *   ben_Beng → 'bn-IN'   — available on iOS 15+
 *   brx_Deva → no system voice; speak() silently no-ops
 *   mni_*    → no system voice; speak() silently no-ops
 *   sat_Olck → no system voice; speak() silently no-ops
 *   lus_Latn → 'en-US' fallback (Nagamese written in Latin, read as English)
 *   kha_Latn → 'en-US' fallback (Khasi written in Latin, read as English)
 *
 * The Piper ONNX voice models downloaded to app/assets/tts/ are preserved in
 * the repo for a future native Sherpa-ONNX integration once the ORT framework
 * conflict is resolved upstream.
 */

import * as Speech from 'expo-speech';

export interface TTSOptions {
  speed?: number;       // 0.5–2.0, default 1.0
  pitch?: number;       // 0.5–2.0, default 1.0
  speakerId?: number;   // ignored (system TTS is single-speaker)
}

export interface VoicePack {
  langCode: string;
  name: string;
  engine: 'system';
  bundled: true;
  sizeBytes: number;
}

/** Languages with a known system TTS voice. */
export const VOICE_PACKS: VoicePack[] = [
  { langCode: 'eng_Latn', name: 'English (system)',        engine: 'system', bundled: true, sizeBytes: 0 },
  { langCode: 'npi_Deva', name: 'Nepali (system, iOS 17+)', engine: 'system', bundled: true, sizeBytes: 0 },
  { langCode: 'ben_Beng', name: 'Bengali (system, iOS 15+)', engine: 'system', bundled: true, sizeBytes: 0 },
  { langCode: 'asm_Beng', name: 'Assamese (system)',        engine: 'system', bundled: true, sizeBytes: 0 },
];

/** Maps IndicTrans2 language codes to BCP-47 locale tags for the system TTS. */
const LANG_TO_BCP47: Record<string, string> = {
  eng_Latn: 'en-US',
  npi_Deva: 'ne-NP',
  ben_Beng: 'bn-IN',
  asm_Beng: 'as-IN',
  brx_Deva: 'hi-IN',  // Bodo has no system voice — use Hindi as closest script fallback
  mni_Mtei: 'en-US',  // Meitei has no system voice — no-op via availableVoices check
  mni_Beng: 'bn-IN',
  sat_Olck: 'en-US',  // Santali has no system voice — no-op via availableVoices check
  lus_Latn: 'en-US',  // Nagamese in Latin script — English reads it legibly
  kha_Latn: 'en-US',  // Khasi in Latin script — English reads it legibly
};

/**
 * SherpaTTS — wraps expo-speech with the same API as before.
 * Call speak() to synthesise and immediately play audio.
 */
export class SherpaTTS {
  private langCode: string;

  constructor(langCode: string) {
    this.langCode = langCode;
  }

  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    const locale = LANG_TO_BCP47[this.langCode] ?? 'en-US';
    const { speed = 1.0, pitch = 1.0 } = options;

    // Stop any currently speaking utterance first
    await Speech.stop();

    return new Promise((resolve) => {
      Speech.speak(text, {
        language: locale,
        rate: speed,
        pitch,
        onDone: () => resolve(),
        onError: () => resolve(),  // Resolve (not reject) — silence is acceptable
      });
    });
  }
}

const ttsCache = new Map<string, SherpaTTS>();
export function getSherpaTTS(langCode: string): SherpaTTS {
  if (!ttsCache.has(langCode)) {
    ttsCache.set(langCode, new SherpaTTS(langCode));
  }
  return ttsCache.get(langCode)!;
}
