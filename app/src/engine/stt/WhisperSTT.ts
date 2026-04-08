/**
 * WhisperSTT — Speech-to-Text via react-native-executorch
 *
 * Uses quantized Whisper models (tiny / base) for on-device transcription.
 * Supports word-level timestamps for karaoke-style highlighting.
 *
 * Model sizes (quantized):
 *   whisper-tiny:  ~40 MB   (fastest, lower accuracy)
 *   whisper-base:  ~80 MB   (recommended balance)
 *   whisper-small: ~150 MB  (highest quality offline)
 *
 * react-native-executorch ships Whisper as a built-in module — no custom
 * native bridge needed. We use the useSpeechToText hook indirectly by
 * wrapping it in an imperative class for use outside of React components.
 */

import * as FileSystem from 'expo-file-system/legacy';

export type WhisperModelSize = 'tiny' | 'base' | 'small';

export interface WhisperWord {
  word: string;
  start: number; // seconds
  end: number;
}

export interface TranscriptionResult {
  text: string;
  language: string;
  words?: WhisperWord[];
  durationMs: number;
}

const WHISPER_MODEL_URLS: Record<WhisperModelSize, string> = {
  tiny: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
  base: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  small: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
};

/**
 * WhisperSTT wraps the react-native-executorch Whisper module.
 * Call transcribe() with an audio file URI (16kHz mono WAV preferred).
 */
export class WhisperSTT {
  private modelSize: WhisperModelSize;
  private modelPath: string | null = null;
  private isLoaded = false;

  constructor(modelSize: WhisperModelSize = 'base') {
    this.modelSize = modelSize;
  }

  /** Download and load the Whisper model. Call once on first use. */
  async load(): Promise<void> {
    const localPath = `${FileSystem.documentDirectory}models/whisper-${this.modelSize}.bin`;
    const info = await FileSystem.getInfoAsync(localPath);

    if (!info.exists) {
      // Download is handled by ModelManager in production.
      // Here we do a direct download as a fallback.
      const url = WHISPER_MODEL_URLS[this.modelSize];
      await FileSystem.downloadAsync(url, localPath);
    }

    this.modelPath = localPath;
    this.isLoaded = true;
  }

  /**
   * Transcribe an audio file to text.
   * audioUri: file:// path to a 16kHz mono WAV or M4A recording.
   * language: BCP-47 code hint (e.g. 'hi', 'en', 'ta'). null = auto-detect.
   */
  async transcribe(audioUri: string, language: string | null = null): Promise<TranscriptionResult> {
    if (!this.isLoaded) await this.load();

    const start = Date.now();

    // react-native-executorch Whisper API (imperative form)
    // The actual hook form (useSpeechToText) is used in the voice UI component.
    // This class provides the non-hook imperative wrapper for use in conversation mode.
    try {
      // Runtime-only access — avoid TS coupling to ExecuTorch's evolving exports
      const Executorch: any = await import('react-native-executorch');
      const WhisperModule = Executorch.WhisperModule ?? Executorch.default?.WhisperModule;
      if (!WhisperModule?.transcribe) throw new Error('WhisperModule unavailable');

      const result = await WhisperModule.transcribe({
        audioPath: audioUri,
        modelPath: this.modelPath!,
        language: language ?? 'auto',
        wordTimestamps: true,
      });

      return {
        text: (result.text ?? '').trim(),
        language: result.language ?? 'unknown',
        words: result.words,
        durationMs: Date.now() - start,
      };
    } catch {
      // Fallback stub for environments without ExecuTorch (e.g. Expo Go)
      return {
        text: '[STT unavailable — ExecuTorch not loaded]',
        language: 'unknown',
        durationMs: Date.now() - start,
      };
    }
  }

  get loaded(): boolean { return this.isLoaded; }
}

/** Singleton instance shared across the app. */
let _instance: WhisperSTT | null = null;
export function getWhisperSTT(size: WhisperModelSize = 'base'): WhisperSTT {
  if (!_instance || (_instance as any).modelSize !== size) {
    _instance = new WhisperSTT(size);
  }
  return _instance!;
}
