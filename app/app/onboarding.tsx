import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useColorScheme,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { Typography } from '@/ui/theme/typography';
import { LANGUAGE_PACKS, formatBytes } from '@/models/LanguagePack';
import { updateSettings } from '@/models/storage';
import { installAllBundledPacks } from '@/models/ModelManager';
import type { PackDirection } from '@/models/LanguagePack';

const { width: SCREEN_W } = Dimensions.get('window');

const SLIDES = [
  {
    icon: '🌍',
    title: 'Welcome to Bhasha',
    subtitle: 'Real-time translation across all 22 Indian languages, plus Mizo and Khasi. Fully offline after first setup.',
  },
  {
    icon: '🔒',
    title: 'Private by Design',
    subtitle: 'Every translation runs on your phone. No cloud, no tracking, no data ever leaves your device.',
  },
  {
    icon: '📦',
    title: 'Choose Your Languages',
    subtitle: 'Download only the language packs you need. Add or remove them anytime from Settings.',
  },
];

export default function OnboardingScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [selectedPacks, setSelectedPacks] = useState<Set<PackDirection>>(
    new Set(['en-indic', 'indic-en']),
  );

  const isLastStep = step === SLIDES.length;

  const handleNext = useCallback(() => {
    if (step < SLIDES.length) {
      setStep(step + 1);
    }
  }, [step]);

  const togglePack = useCallback((id: PackDirection) => {
    setSelectedPacks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleFinish = useCallback(async () => {
    await updateSettings({
      onboardingComplete: true,
      installedPacks: [...selectedPacks],
    });
    // Materialise bundled assets in the background — translate screen
    // will show its own status indicator while this completes.
    installAllBundledPacks().catch((err) =>
      console.warn('Bundled pack install failed:', err),
    );
    router.replace('/(tabs)/translate');
  }, [selectedPacks]);

  const totalSize = [...selectedPacks].reduce((sum, id) => {
    const pack = LANGUAGE_PACKS.find((p) => p.id === id);
    return sum + (pack?.downloadSizeBytes ?? 0);
  }, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 24 }]}>
      {/* Progress dots */}
      <View style={styles.dots}>
        {[...SLIDES, 'packs'].map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: i === step ? colors.primary : colors.border },
              i === step && styles.dotActive,
            ]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {!isLastStep ? (
          // ─── Welcome slides ──────────────────────────────────────────
          <View style={styles.slide}>
            <Text style={styles.icon}>{SLIDES[step].icon}</Text>
            <Text style={[Typography.h1, styles.title, { color: colors.text }]}>
              {SLIDES[step].title}
            </Text>
            <Text style={[Typography.body, styles.subtitle, { color: colors.textSecondary }]}>
              {SLIDES[step].subtitle}
            </Text>
          </View>
        ) : (
          // ─── Pack selection ──────────────────────────────────────────
          <View style={styles.packSelection}>
            <Text style={[Typography.h2, { color: colors.text, textAlign: 'center', marginBottom: 8 }]}>
              Choose Your Packs
            </Text>
            <Text style={[Typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: 24 }]}>
              You can download more later from Settings.
            </Text>

            {LANGUAGE_PACKS.map((pack) => {
              const selected = selectedPacks.has(pack.id);
              return (
                <TouchableOpacity
                  key={pack.id}
                  onPress={() => togglePack(pack.id)}
                  style={[
                    styles.packCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                      borderWidth: selected ? 2 : 1,
                    },
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                      {pack.name}
                    </Text>
                    <Text style={[Typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                      {pack.description}
                    </Text>
                    <Text style={[Typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
                      {formatBytes(pack.downloadSizeBytes)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primary : 'transparent',
                      },
                    ]}
                  >
                    {selected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}

            <Text style={[Typography.caption, { color: colors.textMuted, textAlign: 'center', marginTop: 16 }]}>
              Total download: {formatBytes(totalSize)}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          onPress={isLastStep ? handleFinish : handleNext}
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          disabled={isLastStep && selectedPacks.size === 0}
          accessibilityRole="button"
          accessibilityLabel={isLastStep ? 'Get started' : 'Continue'}
        >
          <Text style={styles.primaryBtnText}>
            {isLastStep ? 'Get Started' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 24 },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  slide: { alignItems: 'center', paddingTop: 48 },
  icon: { fontSize: 96, marginBottom: 24 },
  title: { textAlign: 'center', marginBottom: 16 },
  subtitle: { textAlign: 'center', lineHeight: 24, paddingHorizontal: 12 },
  packSelection: { paddingTop: 16 },
  packCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    gap: 12,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  bottomBar: { paddingHorizontal: 24, paddingTop: 12 },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
