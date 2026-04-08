import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors } from '@/ui/theme/colors';
import { Typography } from '@/ui/theme/typography';
import { LanguagePicker } from '@/ui/components/LanguagePicker';
import { recogniseText } from '@/engine/ocr/OCREngine';
import { LANGUAGES, type Language } from '@/utils/languages';
import { useEngine } from '@/engine/EngineContext';
import { detectLanguage } from '@/engine/langDetect/FastTextDetect';

const DEFAULT_TGT = LANGUAGES.find((l) => l.code === 'eng_Latn')!;

type CameraMode = 'live' | 'capture';

export default function CameraScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const engine = useEngine();

  const [tgtLang, setTgtLang] = useState<Language>(DEFAULT_TGT);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recognisedText, setRecognisedText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isProcessing) return;
    setIsProcessing(true);
    setShowResult(false);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo?.uri) throw new Error('No photo captured');

      // Run OCR
      const ocrResult = await recogniseText(photo.uri);
      setRecognisedText(ocrResult.fullText);

      let translation = '';
      if (ocrResult.fullText) {
        const detected = await detectLanguage(ocrResult.fullText);
        try {
          const result = await engine.translate(
            ocrResult.fullText,
            detected.langCode,
            tgtLang.code,
          );
          translation = result.translation;
        } catch (err) {
          console.warn('OCR translation failed:', err);
          translation = '[Translation unavailable]';
        }
      }
      setTranslatedText(translation);
      setShowResult(true);
    } catch (err) {
      Alert.alert('Capture failed', String(err));
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, tgtLang, engine]);

  const handleDismissResult = useCallback(() => {
    setShowResult(false);
    setRecognisedText('');
    setTranslatedText('');
  }, []);

  if (!permission) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
        <Text style={styles.permissionIcon}>📷</Text>
        <Text style={[Typography.h3, { color: colors.text, textAlign: 'center' }]}>
          Camera access needed
        </Text>
        <Text style={[Typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: 8 }]}>
          Bhasha uses the camera to translate text in photos and signs.
        </Text>
        <TouchableOpacity
          style={[styles.permissionBtn, { backgroundColor: colors.primary }]}
          onPress={requestPermission}
        >
          <Text style={styles.permissionBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      {/* Top overlay — language picker */}
      <View style={[styles.topOverlay, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topInner}>
          <Text style={styles.overlayLabel}>Translate to:</Text>
          <View style={{ flex: 1 }}>
            <LanguagePicker
              selected={tgtLang}
              onSelect={setTgtLang}
              label="Target language"
            />
          </View>
        </View>
      </View>

      {/* Capture target overlay */}
      {!showResult && (
        <View style={styles.targetOverlay} pointerEvents="none">
          <View style={[styles.targetCorner, styles.targetTL]} />
          <View style={[styles.targetCorner, styles.targetTR]} />
          <View style={[styles.targetCorner, styles.targetBL]} />
          <View style={[styles.targetCorner, styles.targetBR]} />
        </View>
      )}

      {/* Result panel */}
      {showResult && (
        <View style={[styles.resultPanel, { backgroundColor: colors.surface }]}>
          <ScrollView contentContainerStyle={styles.resultContent}>
            <Text style={[styles.resultLabel, { color: colors.textMuted }]}>Detected text</Text>
            <Text style={[Typography.indic, { color: colors.text, marginBottom: 16 }]} selectable>
              {recognisedText || '(No text detected)'}
            </Text>

            <View style={[styles.resultDivider, { backgroundColor: colors.border }]} />

            <Text style={[styles.resultLabel, { color: colors.primary }]}>{tgtLang.name}</Text>
            <Text style={[Typography.indic, { color: colors.text }]} selectable>
              {translatedText || '(No translation available)'}
            </Text>
          </ScrollView>

          <TouchableOpacity
            onPress={handleDismissResult}
            style={[styles.dismissBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.dismissBtnText}>Capture Another</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom capture button */}
      {!showResult && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            onPress={handleCapture}
            disabled={isProcessing}
            style={styles.captureBtn}
            accessibilityLabel="Capture and translate"
            accessibilityRole="button"
          >
            <View style={[styles.captureBtnOuter, isProcessing && { opacity: 0.5 }]}>
              <View style={styles.captureBtnInner}>
                {isProcessing ? <ActivityIndicator color="#fff" /> : null}
              </View>
            </View>
          </TouchableOpacity>
          <Text style={styles.captureLabel}>
            {isProcessing ? 'Reading text…' : 'Tap to translate'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permissionIcon: { fontSize: 64, marginBottom: 16 },
  permissionBtn: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permissionBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  topInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  overlayLabel: { color: '#fff', fontSize: 13 },
  targetOverlay: {
    position: 'absolute',
    top: '30%',
    left: '10%',
    right: '10%',
    bottom: '35%',
  },
  targetCorner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#fff',
  },
  targetTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  targetTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  targetBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  targetBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
  },
  captureBtn: { alignItems: 'center', justifyContent: 'center' },
  captureBtnOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureLabel: { color: '#fff', fontSize: 13, fontWeight: '500' },
  resultPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '60%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  resultContent: { paddingBottom: 12 },
  resultLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  resultDivider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
  dismissBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  dismissBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
