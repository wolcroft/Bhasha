/**
 * Bundled TTS voice asset registry — PRESERVED FOR FUTURE USE.
 *
 * The Piper VITS voice models (eng_Latn, npi_Deva) are stored in
 * app/assets/tts/ for a future native Sherpa-ONNX TTS integration.
 * They are NOT currently used at runtime — TTS is handled by expo-speech
 * (system TTS) in SherpaTTS.ts to avoid the onnxruntime.xcframework
 * conflict between react-native-sherpa-onnx-offline-tts and onnxruntime-c.
 *
 * When the upstream conflict is resolved, restore the Piper-based
 * implementation from git history and wire these assets back in via
 * installAllBundledTTS() in ModelManager.ts.
 */

// No exports needed — module retained as a placeholder.
export {};

