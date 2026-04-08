const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Allow bundling .onnx model files + tokenizer assets
// Note: txt is treated as source by default — strip it from sourceExts so
// merges.txt is bundled as a raw asset.
config.resolver.sourceExts = config.resolver.sourceExts.filter(
  (ext) => ext !== 'txt',
);
config.resolver.assetExts = [
  ...config.resolver.assetExts,
  'onnx',
  'bin',
  'tflite',
  'pte',  // ExecuTorch model format
  'txt',  // merges.txt — BPE merge rules
];

// Allow importing from src/ with @ alias
config.resolver.alias = {
  '@': path.resolve(__dirname, 'src'),
};

module.exports = config;
