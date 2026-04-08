/**
 * SherpaSTT — Speech-to-Text via Sherpa-ONNX (fallback)
 *
 * Used on devices where react-native-executorch underperforms.
 * Sherpa-ONNX supports streaming STT with Hindi, English natively.
 * Other Indic languages fall back to Whisper.
 */

export type SherpaModel = 'hindi' | 'english';

export interface SherpaTranscriptionResult {
  text: string;
  durationMs: number;
}

const SHERPA_SUPPORTED_LANG_PREFIXES = new Set(['hin', 'eng']);

/** Returns true if Sherpa-ONNX natively supports this IndicTrans2 language code. */
export function sherpaSupportsLanguage(langCode: string): boolean {
  const prefix = langCode.split('_')[0];
  return SHERPA_SUPPORTED_LANG_PREFIXES.has(prefix);
}

/**
 * SherpaSTT — wraps react-native-sherpa-onnx for streaming STT.
 * Currently a thin wrapper; full implementation uses the Sherpa C++ native module.
 */
export class SherpaSTT {
  private langCode: string;

  constructor(langCode: string) {
    this.langCode = langCode;
  }

  async transcribe(audioUri: string): Promise<SherpaTranscriptionResult> {
    const start = Date.now();

    try {
      // react-native-sherpa-onnx API — resolved at runtime to avoid build-time
      // dependency on a package that may not yet be installed.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const SherpaModule: any = require('react-native-sherpa-onnx-offline-tts');
      const text =
        (await SherpaModule?.SherpaOnnxSTT?.transcribeFile?.(audioUri)) ?? '';
      return { text: String(text).trim(), durationMs: Date.now() - start };
    } catch {
      return {
        text: '[SherpaSTT unavailable]',
        durationMs: Date.now() - start,
      };
    }
  }
}
