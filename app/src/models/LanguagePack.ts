/**
 * Language Pack definitions — bundled-asset edition.
 *
 * v1.0 ships with all three model directions bundled in the app binary
 * (no CDN downloads). Each pack tracks its install state for the UI but
 * the heavy lifting happens at first launch when expo-asset copies bundled
 * binaries to the writable document directory.
 */

import * as FileSystem from 'expo-file-system/legacy';

export type PackDirection =
  | 'en-indic'
  | 'indic-en'
  | 'indic-indic'
  | 'en-lus_Latn'   // Nagamese (LoRA, lus_Latn slot)
  | 'en-kha_Latn';  // Khasi (LoRA, kha_Latn slot)

export interface LanguagePack {
  id: PackDirection;
  name: string;
  description: string;
  /** Languages covered by this pack (source codes) */
  languageCodes: string[];
  /** On-disk size after extraction (approximate) */
  installedSizeBytes: number;
  /** Version string, used to detect bundled-asset updates */
  version: string;
}

export const LANGUAGE_PACKS: LanguagePack[] = [
  {
    id: 'en-indic',
    name: 'English → Northeast Languages',
    description:
      'Translate from English into Assamese, Bengali, Bodo, Manipuri, Nepali, and Santali. Bundled with the app — no download needed.',
    languageCodes: ['eng_Latn'],
    installedSizeBytes: 280 * 1024 * 1024,
    version: '1.0.0',
  },
  {
    id: 'indic-en',
    name: 'Northeast Languages → English',
    description:
      'Translate from any of the 6 Tier-1 Northeast languages back into English.',
    languageCodes: [
      'asm_Beng', 'ben_Beng', 'brx_Deva', 'mni_Mtei', 'npi_Deva', 'sat_Olck',
    ],
    installedSizeBytes: 280 * 1024 * 1024,
    version: '1.0.0',
  },
  {
    id: 'indic-indic',
    name: 'Northeast ↔ Northeast',
    description:
      'Translate directly between any two Northeast languages (e.g. Assamese → Manipuri) without going through English.',
    languageCodes: ['*indic'],
    installedSizeBytes: 380 * 1024 * 1024,
    version: '1.0.0',
  },
  {
    id: 'en-lus_Latn',
    name: 'English → Nagamese',
    description:
      'Translate from English into Nagamese (the lingua franca of Nagaland). LoRA fine-tuned on 7,500 parallel pairs. Bundled with the app.',
    languageCodes: ['eng_Latn'],
    installedSizeBytes: 215 * 1024 * 1024,
    version: '1.0.0',
  },
  {
    id: 'en-kha_Latn',
    name: 'English → Khasi',
    description:
      'Translate from English into Khasi (principal language of Meghalaya). LoRA fine-tuned on 27,000 parallel pairs. Bundled with the app.',
    languageCodes: ['eng_Latn'],
    installedSizeBytes: 215 * 1024 * 1024,
    version: '1.0.0',
  },
];

export function getPackById(id: PackDirection): LanguagePack | undefined {
  return LANGUAGE_PACKS.find((p) => p.id === id);
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

/** Returns the writable directory where pack files live after first-launch copy. */
export function getPackDirectory(id: PackDirection): string {
  return `${FileSystem.documentDirectory}models/${id}`;
}

export function getEncoderPath(id: PackDirection): string {
  return `${getPackDirectory(id)}/encoder_model_int8.onnx`;
}

export function getDecoderPath(id: PackDirection): string {
  return `${getPackDirectory(id)}/decoder_model_int8.onnx`;
}

export function getTokenizerPath(id: PackDirection): string {
  return `${getPackDirectory(id)}/tokenizer.onnx`;
}

export function getDetokenizerPath(id: PackDirection): string {
  return `${getPackDirectory(id)}/detokenizer.onnx`;
}

/** Check if a pack's model files have been copied to the writable directory. */
export async function isPackInstalled(id: PackDirection): Promise<boolean> {
  const [enc, dec, tok, detok] = await Promise.all([
    FileSystem.getInfoAsync(getEncoderPath(id)),
    FileSystem.getInfoAsync(getDecoderPath(id)),
    FileSystem.getInfoAsync(getTokenizerPath(id)),
    FileSystem.getInfoAsync(getDetokenizerPath(id)),
  ]);
  return enc.exists && dec.exists && tok.exists && detok.exists;
}
