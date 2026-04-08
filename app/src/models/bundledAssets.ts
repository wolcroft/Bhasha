/**
 * Bundled model asset registry.
 *
 * Each direction ships four ONNX files plus a tokens.json sidecar:
 *   - encoder/decoder are the seq2seq translation graphs
 *   - tokenizer/detokenizer are the SentencePiece-backed pre/post-processing
 *     graphs built by model-export/build_tokenizer_onnx.py
 *   - tokens.json holds the per-direction language tag → fairseq id table
 *     plus special-token ids; it's small enough to inline as a JS module so
 *     we don't have to round-trip it through the file system.
 *
 * To replace placeholder files with real ones, run the model-export pipeline:
 *   cd model-export && ./run_pipeline.sh
 *
 * NOTE: every entry must be a literal `require(...)` call. Metro static
 * analysis cannot resolve dynamic paths.
 */

import type { TokenizerMeta } from '@/engine/translation/tokenizer';

export interface BundledModelAssets {
  encoder: number;          // require() module ID — opaque to JS, used by expo-asset
  decoder: number;
  tokenizer: number;
  detokenizer: number;
  /** Inlined tokens.json contents (Metro parses .json requires into objects). */
  tokensMeta: TokenizerMeta;
}

export const BUNDLED_MODELS: Record<'en-indic' | 'indic-en' | 'indic-indic', BundledModelAssets> = {
  'en-indic': {
    encoder:     require('../../assets/models/en-indic/encoder_model_int8.onnx'),
    decoder:     require('../../assets/models/en-indic/decoder_model_int8.onnx'),
    tokenizer:   require('../../assets/models/en-indic/tokenizer.onnx'),
    detokenizer: require('../../assets/models/en-indic/detokenizer.onnx'),
    tokensMeta:  require('../../assets/models/en-indic/tokens.json') as TokenizerMeta,
  },
  'indic-en': {
    encoder:     require('../../assets/models/indic-en/encoder_model_int8.onnx'),
    decoder:     require('../../assets/models/indic-en/decoder_model_int8.onnx'),
    tokenizer:   require('../../assets/models/indic-en/tokenizer.onnx'),
    detokenizer: require('../../assets/models/indic-en/detokenizer.onnx'),
    tokensMeta:  require('../../assets/models/indic-en/tokens.json') as TokenizerMeta,
  },
  'indic-indic': {
    encoder:     require('../../assets/models/indic-indic/encoder_model_int8.onnx'),
    decoder:     require('../../assets/models/indic-indic/decoder_model_int8.onnx'),
    tokenizer:   require('../../assets/models/indic-indic/tokenizer.onnx'),
    detokenizer: require('../../assets/models/indic-indic/detokenizer.onnx'),
    tokensMeta:  require('../../assets/models/indic-indic/tokens.json') as TokenizerMeta,
  },
};

export type BundledDirection = keyof typeof BUNDLED_MODELS;
