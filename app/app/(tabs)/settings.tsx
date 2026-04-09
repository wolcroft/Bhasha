import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Alert,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/ui/theme/colors';
import { Typography } from '@/ui/theme/typography';
import {
  LANGUAGE_PACKS,
  formatBytes,
  isPackInstalled,
  type PackDirection,
} from '@/models/LanguagePack';
import {
  downloadPack,
  deletePack,
  getStorageUsedBytes,
  subscribeToPackState,
  initModelManager,
  type PackState,
} from '@/models/ModelManager';
import { getSettings, updateSettings, clearHistory, type AppSettings } from '@/models/storage';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [packStates, setPackStates] = useState<Record<string, PackState>>({});
  const [storageUsed, setStorageUsed] = useState(0);

  useEffect(() => {
    initModelManager();
    getSettings().then(setSettings);
    getStorageUsedBytes().then(setStorageUsed);

    const unsubs = LANGUAGE_PACKS.map((pack) =>
      subscribeToPackState(pack.id, (state) => {
        setPackStates((prev) => ({ ...prev, [pack.id]: state }));
        if (state.status === 'installed') {
          getStorageUsedBytes().then(setStorageUsed);
        }
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  const handleToggleTTS = useCallback(async (value: boolean) => {
    await updateSettings({ ttsEnabled: value });
    setSettings((s) => s ? { ...s, ttsEnabled: value } : s);
  }, []);

  const handleToggleAutoDetect = useCallback(async (value: boolean) => {
    await updateSettings({ autoDetectLang: value });
    setSettings((s) => s ? { ...s, autoDetectLang: value } : s);
  }, []);

  const handleDownload = useCallback(async (pack: typeof LANGUAGE_PACKS[0]) => {
    await downloadPack(pack);
  }, []);

  const handleDelete = useCallback((id: PackDirection) => {
    Alert.alert(
      'Delete Language Pack',
      'This will remove the model files from your device. You can re-download them later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deletePack(id);
            getStorageUsedBytes().then(setStorageUsed);
          },
        },
      ],
    );
  }, []);

  const handleClearHistory = useCallback(() => {
    Alert.alert('Clear History', 'Delete all saved translations?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearHistory },
    ]);
  }, []);

  const renderPackRow = (pack: typeof LANGUAGE_PACKS[0]) => {
    const state = packStates[pack.id];
    const status = state?.status ?? 'idle';
    const progress = state?.progressFraction ?? 0;

    return (
      <View key={pack.id} style={[styles.packCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.packInfo}>
          <Text style={[Typography.bodyMedium, { color: colors.text }]}>{pack.name}</Text>
          <Text style={[Typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
            {pack.description}
          </Text>
          <Text style={[Typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
            {formatBytes(pack.installedSizeBytes)} · v{pack.version}
          </Text>
        </View>

        <View style={styles.packAction}>
          {status === 'installed' ? (
            <TouchableOpacity
              onPress={() => handleDelete(pack.id)}
              style={[styles.actionBtn, { backgroundColor: colors.surfaceElevated }]}
              accessibilityLabel={`Delete ${pack.name}`}
            >
              <Text style={[styles.actionBtnText, { color: colors.error }]}>Delete</Text>
            </TouchableOpacity>
          ) : status === 'downloading' || status === 'extracting' ? (
            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                <View
                  style={[styles.progressFill, {
                    backgroundColor: colors.primary,
                    width: `${Math.round(progress * 100)}%` as any,
                  }]}
                />
              </View>
              <Text style={[Typography.caption, { color: colors.textSecondary, marginTop: 4 }]}>
                {status === 'extracting' ? 'Extracting…' : `${Math.round(progress * 100)}%`}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => handleDownload(pack)}
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              accessibilityLabel={`Download ${pack.name}`}
            >
              <Text style={[styles.actionBtnText, { color: '#fff' }]}>Download</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[Typography.h2, styles.pageTitle, { color: colors.text }]}>Settings</Text>

      {/* Language Packs */}
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>LANGUAGE PACKS</Text>
      <Text style={[Typography.caption, { color: colors.textSecondary, marginBottom: 12 }]}>
        Storage used: {formatBytes(storageUsed)}
      </Text>
      {LANGUAGE_PACKS.map(renderPackRow)}

      {/* Preferences */}
      <Text style={[styles.sectionTitle, { color: colors.textMuted, marginTop: 24 }]}>PREFERENCES</Text>

      <View style={[styles.prefCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.prefRow}>
          <View>
            <Text style={[Typography.body, { color: colors.text }]}>Text-to-Speech</Text>
            <Text style={[Typography.caption, { color: colors.textSecondary }]}>Speak translations aloud</Text>
          </View>
          <Switch
            value={settings?.ttsEnabled ?? true}
            onValueChange={handleToggleTTS}
            trackColor={{ true: colors.primary }}
            accessibilityLabel="Enable text to speech"
          />
        </View>

        <View style={[styles.prefDivider, { backgroundColor: colors.border }]} />

        <View style={styles.prefRow}>
          <View>
            <Text style={[Typography.body, { color: colors.text }]}>Auto-detect Language</Text>
            <Text style={[Typography.caption, { color: colors.textSecondary }]}>Detect source language automatically</Text>
          </View>
          <Switch
            value={settings?.autoDetectLang ?? true}
            onValueChange={handleToggleAutoDetect}
            trackColor={{ true: colors.primary }}
            accessibilityLabel="Enable auto language detection"
          />
        </View>
      </View>

      {/* Data */}
      <Text style={[styles.sectionTitle, { color: colors.textMuted, marginTop: 24 }]}>DATA</Text>
      <View style={[styles.prefCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity style={styles.prefRow} onPress={handleClearHistory}>
          <Text style={[Typography.body, { color: colors.error }]}>Clear Translation History</Text>
        </TouchableOpacity>
      </View>

      {/* About */}
      <Text style={[styles.sectionTitle, { color: colors.textMuted, marginTop: 24 }]}>ABOUT</Text>
      <View style={[styles.prefCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.prefRow}>
          <Text style={[Typography.body, { color: colors.text }]}>Bhasha</Text>
          <Text style={[Typography.body, { color: colors.textSecondary }]}>v1.0.0</Text>
        </View>
        <View style={[styles.prefDivider, { backgroundColor: colors.border }]} />
        <View style={styles.prefRow}>
          <Text style={[Typography.bodySmall, { color: colors.textSecondary, flex: 1 }]}>
            Powered by IndicTrans2 (AI4Bharat), Whisper, and Sherpa-ONNX. All translation runs on-device — no data ever leaves your phone.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 0 },
  pageTitle: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  packCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  packInfo: { flex: 1 },
  packAction: { alignItems: 'flex-end', justifyContent: 'center', minWidth: 90 },
  actionBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
  progressContainer: { width: 90, alignItems: 'stretch' },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  prefCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    gap: 12,
  },
  prefDivider: { height: StyleSheet.hairlineWidth },
});
