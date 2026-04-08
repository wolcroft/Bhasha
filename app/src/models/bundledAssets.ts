/**
 * Bundled model asset registry.
 *
 * Each model direction is registered as a set of `require()` calls so Metro
 * bundles them with the app binary. At runtime, expo-asset resolves each
 * `require` to a local file URI that ONNX Runtime can read.
 *
 * To replace placeholder files with real ones, run:
 *   model-export/copy_to_app.py
 *
 * NOTE: every entry must be a literal `require(...)` call. Metro static
 * analysis cannot resolve dynamic paths.
 */

export interface BundledModelAssets {
  encoder: number;  // require() module ID
  decoder: number;
  vocab: number;
  merges: number;
}

export const BUNDLED_MODELS: Record<'en-indic' | 'indic-en' | 'indic-indic', BundledModelAssets> = {
  'en-indic': {
    encoder: require('../../assets/models/en-indic/encoder_model_int8.onnx'),
    decoder: require('../../assets/models/en-indic/decoder_model_int8.onnx'),
    vocab:   require('../../assets/models/en-indic/vocab.txt'),
    merges:  require('../../assets/models/en-indic/merges.txt'),
  },
  'indic-en': {
    encoder: require('../../assets/models/indic-en/encoder_model_int8.onnx'),
    decoder: require('../../assets/models/indic-en/decoder_model_int8.onnx'),
    vocab:   require('../../assets/models/indic-en/vocab.txt'),
    merges:  require('../../assets/models/indic-en/merges.txt'),
  },
  'indic-indic': {
    encoder: require('../../assets/models/indic-indic/encoder_model_int8.onnx'),
    decoder: require('../../assets/models/indic-indic/decoder_model_int8.onnx'),
    vocab:   require('../../assets/models/indic-indic/vocab.txt'),
    merges:  require('../../assets/models/indic-indic/merges.txt'),
  },
};

export type BundledDirection = keyof typeof BUNDLED_MODELS;
