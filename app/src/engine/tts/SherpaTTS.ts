/**
 * SherpaTTS — Text-to-Speech via Sherpa-ONNX (Piper / Kokoro VITS)
 *
 * Supported engines:
 *  - Piper VITS: 50+ languages, Hindi, English, and more (~15-50MB per voice)
 *  - Kokoro-82M: Higher quality English (and some Indian English variants)
 *
 * Voice packs are downloaded on-demand via ModelManager and stored locally.
 * Adjustable speed (0.5x – 2.0x), pitch, volume.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { playAudioFile } from '@/utils/audio';
import type { Sound } from 'expo-av/build/Audio';

export interface TTSOptions {
  speed?: number;       // 0.5–2.0, default 1.0
  pitch?: number;       // 0.5–2.0, default 1.0
  speakerId?: number;   // For multi-speaker models (0 = default)
}

export interface VoicePack {
  langCode: string;     // IndicTrans2 lang code, e.g. 'eng_Latn'
  name: string;
  engine: 'piper' | 'kokoro';
  /** true = bundled with the app; false = CDN download (not yet supported) */
  bundled: boolean;
  sizeBytes: number;
}

/**
 * Voice packs available in v1.0.
 *
 * Only languages with a Piper VITS model are listed. Bengali, Assamese,
 * Manipuri, Santali, Nagamese and Khasi have no upstream Piper voice pack
 * and are intentionally omitted — the speak button no-ops for those languages.
 */
export const VOICE_PACKS: VoicePack[] = [
  {
    langCode: 'eng_Latn',
    name: 'English (en_US-amy-low)',
    engine: 'piper',
    bundled: true,
    sizeBytes: 63 * 1024 * 1024,
  },
  {
    langCode: 'npi_Deva',
    name: 'Nepali (ne_NP-google-x_low)',
    engine: 'piper',
    bundled: true,
    sizeBytes: 27 * 1024 * 1024,
  },
];

function getVoiceDir(langCode: string): string {
  return `${FileSystem.documentDirectory}tts/${langCode}`;
}

/** Returns true if a voice pack is installed for this language. */
export async function isVoiceInstalled(langCode: string): Promise<boolean> {
  const dir = getVoiceDir(langCode);
  const info = await FileSystem.getInfoAsync(dir);
  return info.exists;
}

/**
 * SherpaTTS — wraps the Sherpa-ONNX TTS module.
 * Call speak() to synthesise and immediately play audio.
 * Call synthesise() to get a file URI for deferred playback.
 */
export class SherpaTTS {
  private langCode: string;

  constructor(langCode: string) {
    this.langCode = langCode;
  }

  async speak(text: string, options: TTSOptions = {}): Promise<Sound | null> {
    const uri = await this.synthesise(text, options);
    if (!uri) return null;
    return playAudioFile(uri);
  }

  async synthesise(text: string, options: TTSOptions = {}): Promise<string | null> {
    const voiceDir = getVoiceDir(this.langCode);
    const installed = await isVoiceInstalled(this.langCode);
    if (!installed) return null;

    const { speed = 1.0, pitch = 1.0, speakerId = 0 } = options;

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const SherpaModule: any = require('react-native-sherpa-onnx-offline-tts');
      const outPath = `${FileSystem.cacheDirectory}bhasha-tts-${Date.now()}.wav`;

      const generator = SherpaModule?.default ?? SherpaModule;
      await generator.generate({
        text,
        voiceDir,
        speakerId,
        speed,
        outputPath: outPath,
      });

      return outPath;
    } catch {
      console.warn(`SherpaTTS: synthesis failed for ${this.langCode}`);
      return null;
    }
  }
}

const ttsCache = new Map<string, SherpaTTS>();
export function getSherpaTTS(langCode: string): SherpaTTS {
  if (!ttsCache.has(langCode)) {
    ttsCache.set(langCode, new SherpaTTS(langCode));
  }
  return ttsCache.get(langCode)!;
}
