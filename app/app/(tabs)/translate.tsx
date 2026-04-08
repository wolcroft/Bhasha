import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  Clipboard,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '@/ui/theme/colors';
import { TranslationCard } from '@/ui/components/TranslationCard';
import { LanguagePicker } from '@/ui/components/LanguagePicker';
import { getLanguage, LANGUAGES, type Language } from '@/utils/languages';
import { detectLanguage } from '@/engine/langDetect/FastTextDetect';
import { addToHistory } from '@/models/storage';
import { useEngine } from '@/engine/EngineContext';

// Default languages
const DEFAULT_SRC = LANGUAGES.find((l) => l.code === 'eng_Latn')!;
const DEFAULT_TGT = LANGUAGES.find((l) => l.code === 'hin_Deva')!;

type TranslationState = 'idle' | 'loading' | 'done' | 'error';

export default function TranslateScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const engine = useEngine();
  const [srcLang, setSrcLang] = useState<Language>(DEFAULT_SRC);
  const [tgtLang, setTgtLang] = useState<Language>(DEFAULT_TGT);
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [translationState, setTranslationState] = useState<TranslationState>('idle');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swapRotation = useSharedValue(0);

  // Auto-translate on text change (debounced 800ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!sourceText.trim()) {
      setTranslatedText('');
      setTranslationState('idle');
      return;
    }

    debounceRef.current = setTimeout(() => {
      handleTranslate();
    }, 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [sourceText, srcLang, tgtLang]);

  const handleTranslate = useCallback(async () => {
    if (!sourceText.trim()) return;
    if (engine.status !== 'ready') return;
    setTranslationState('loading');

    try {
      const result = await engine.translate(sourceText, srcLang.code, tgtLang.code);
      setTranslatedText(result.translation);
      setLatencyMs(result.latencyMs);
      setTranslationState('done');

      await addToHistory({
        sourceText,
        targetText: result.translation,
        srcLang: srcLang.code,
        tgtLang: tgtLang.code,
      });
    } catch (err) {
      setTranslationState('error');
      console.error('Translation error:', err);
    }
  }, [sourceText, srcLang, tgtLang, engine]);

  const handleSwap = useCallback(() => {
    swapRotation.value = withSpring(swapRotation.value + 180, { damping: 15, stiffness: 200 });

    setSrcLang(tgtLang);
    setTgtLang(srcLang);
    setSourceText(translatedText);
    setTranslatedText(sourceText);
  }, [srcLang, tgtLang, sourceText, translatedText]);

  const handleAutoDetect = useCallback(async () => {
    if (!sourceText.trim()) return;
    const result = await detectLanguage(sourceText);
    const detected = getLanguage(result.langCode);
    if (detected && detected.code !== srcLang.code) {
      setSrcLang(detected);
    }
  }, [sourceText, srcLang]);

  const handleCopy = useCallback(() => {
    Clipboard.setString(translatedText);
    Alert.alert('Copied', 'Translation copied to clipboard.');
  }, [translatedText]);

  const handleClear = useCallback(() => {
    setSourceText('');
    setTranslatedText('');
    setTranslationState('idle');
  }, []);

  const swapStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${swapRotation.value}deg` }],
  }));

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Bhasha</Text>
        <TouchableOpacity
          onPress={handleAutoDetect}
          style={[styles.detectBtn, { backgroundColor: colors.primaryMuted }]}
          accessibilityLabel="Auto-detect source language"
          accessibilityRole="button"
        >
          <Text style={[styles.detectBtnText, { color: colors.primary }]}>Detect</Text>
        </TouchableOpacity>
      </View>

      {/* Language selector row */}
      <View style={styles.langRow}>
        <LanguagePicker
          selected={srcLang}
          onSelect={setSrcLang}
          excludeCode={tgtLang.code}
          label="Source language"
        />

        <TouchableOpacity
          onPress={handleSwap}
          style={[styles.swapBtn, { backgroundColor: colors.surfaceElevated }]}
          accessibilityLabel="Swap languages"
          accessibilityRole="button"
        >
          <Animated.Text style={[styles.swapIcon, swapStyle]}>⇄</Animated.Text>
        </TouchableOpacity>

        <LanguagePicker
          selected={tgtLang}
          onSelect={setTgtLang}
          excludeCode={srcLang.code}
          label="Target language"
        />
      </View>

      {/* Cards */}
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TranslationCard
          role="source"
          language={srcLang}
          text={sourceText}
          onChangeText={setSourceText}
          onClear={handleClear}
          placeholder="Type or paste text to translate…"
        />

        <View style={styles.divider}>
          {translationState === 'loading' && (
            <View style={[styles.statusPill, { backgroundColor: colors.primaryMuted }]}>
              <Text style={[styles.statusText, { color: colors.primary }]}>Translating offline…</Text>
            </View>
          )}
        </View>

        <TranslationCard
          role="target"
          language={tgtLang}
          text={translatedText}
          isLoading={translationState === 'loading'}
          onCopy={translatedText ? handleCopy : undefined}
          onSpeak={translatedText ? () => {} : undefined}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  detectBtn: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  detectBtnText: { fontSize: 13, fontWeight: '600' },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  swapBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapIcon: { fontSize: 20 },
  scrollContent: { padding: 16, gap: 0 },
  divider: { height: 16, alignItems: 'center', justifyContent: 'center' },
  statusPill: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '500' },
});
