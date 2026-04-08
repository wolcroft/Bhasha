import React from 'react';
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { Colors } from '@/ui/theme/colors';
import { Typography } from '@/ui/theme/typography';
import type { Language } from '@/utils/languages';

export type CardRole = 'source' | 'target';

interface Props {
  role: CardRole;
  language: Language;
  text: string;
  onChangeText?: (text: string) => void;
  isLoading?: boolean;
  onCopy?: () => void;
  onSpeak?: () => void;
  onClear?: () => void;
  placeholder?: string;
}

export function TranslationCard({
  role,
  language,
  text,
  onChangeText,
  isLoading,
  onCopy,
  onSpeak,
  onClear,
  placeholder,
}: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;

  const isRTL = language.rtl ?? false;
  const isSource = role === 'source';

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Language label */}
      <View style={styles.langRow}>
        <Text style={[styles.langLabel, { color: colors.primary }]}>{language.nativeName}</Text>
        <Text style={[styles.langSub, { color: colors.textMuted }]}>{language.name}</Text>
      </View>

      {/* Text area */}
      <View style={styles.textArea}>
        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Translating…</Text>
          </View>
        ) : isSource ? (
          <TextInput
            style={[
              styles.input,
              Typography.indic,
              { color: colors.text, textAlign: isRTL ? 'right' : 'left' },
            ]}
            value={text}
            onChangeText={onChangeText}
            placeholder={placeholder ?? 'Enter text to translate…'}
            placeholderTextColor={colors.textMuted}
            multiline
            autoCorrect={false}
            autoCapitalize="none"
            textAlignVertical="top"
            accessibilityLabel={`Source text in ${language.name}`}
            accessibilityHint="Type the text you want to translate"
          />
        ) : (
          <Text
            selectable
            style={[
              styles.outputText,
              Typography.indic,
              { color: colors.text, textAlign: isRTL ? 'right' : 'left' },
            ]}
            accessibilityLabel={`Translation in ${language.name}: ${text}`}
          >
            {text || <Text style={{ color: colors.textMuted }}>Translation appears here</Text>}
          </Text>
        )}
      </View>

      {/* Action row */}
      <View style={styles.actions}>
        {isSource && text.length > 0 && onClear && (
          <TouchableOpacity
            onPress={onClear}
            style={styles.actionBtn}
            accessibilityLabel="Clear text"
            accessibilityRole="button"
          >
            <Text style={[styles.actionIcon, { color: colors.textMuted }]}>✕</Text>
          </TouchableOpacity>
        )}
        {!isSource && text.length > 0 && (
          <>
            {onCopy && (
              <TouchableOpacity
                onPress={onCopy}
                style={styles.actionBtn}
                accessibilityLabel="Copy translation"
                accessibilityRole="button"
              >
                <Text style={[styles.actionLabel, { color: colors.primary }]}>Copy</Text>
              </TouchableOpacity>
            )}
            {onSpeak && (
              <TouchableOpacity
                onPress={onSpeak}
                style={styles.actionBtn}
                accessibilityLabel="Speak translation"
                accessibilityRole="button"
              >
                <Text style={[styles.actionLabel, { color: colors.primary }]}>Speak</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        {isSource && (
          <Text style={[styles.charCount, { color: colors.textMuted }]}>{text.length}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    minHeight: 160,
    gap: 8,
  },
  langRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  langLabel: { fontSize: 14, fontWeight: '600' },
  langSub: { fontSize: 12 },
  textArea: { flex: 1, minHeight: 90 },
  input: { flex: 1, fontSize: 18, lineHeight: 28, padding: 0 },
  outputText: { fontSize: 18, lineHeight: 28 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  loadingText: { fontSize: 14 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  actionBtn: { padding: 4 },
  actionIcon: { fontSize: 16 },
  actionLabel: { fontSize: 14, fontWeight: '500' },
  charCount: { fontSize: 12, marginLeft: 'auto' },
});
