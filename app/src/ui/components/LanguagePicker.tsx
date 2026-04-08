import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  useColorScheme,
  SectionList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/ui/theme/colors';
import { Typography } from '@/ui/theme/typography';
import { getLanguageGroups, type Language } from '@/utils/languages';

interface Props {
  selected: Language;
  onSelect: (lang: Language) => void;
  excludeCode?: string;
  label: string;
}

export function LanguagePicker({ selected, onSelect, excludeCode, label }: Props) {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const groups = getLanguageGroups();

  const filteredSections = groups
    .map((g) => ({
      title: g.label,
      data: g.languages.filter(
        (l) =>
          l.code !== excludeCode &&
          (search === '' ||
            l.name.toLowerCase().includes(search.toLowerCase()) ||
            l.nativeName.toLowerCase().includes(search.toLowerCase())),
      ),
    }))
    .filter((s) => s.data.length > 0);

  const handleSelect = useCallback(
    (lang: Language) => {
      onSelect(lang);
      setVisible(false);
      setSearch('');
    },
    [onSelect],
  );

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
        onPress={() => setVisible(true)}
        accessibilityLabel={`${label}: ${selected.name}`}
        accessibilityRole="button"
      >
        <Text style={[styles.triggerNative, { color: colors.text }]}>{selected.nativeName}</Text>
        <Text style={[styles.triggerName, { color: colors.textSecondary }]}>{selected.name}</Text>
        <Text style={[styles.chevron, { color: colors.textMuted }]}>▾</Text>
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[Typography.h3, { color: colors.text }]}>{label}</Text>
            <TouchableOpacity onPress={() => { setVisible(false); setSearch(''); }}>
              <Text style={[styles.closeBtn, { color: colors.primary }]}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search languages..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              accessibilityLabel="Search languages"
            />
          </View>

          {/* Language list grouped by script */}
          <SectionList
            sections={filteredSections}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.langItem,
                  { borderBottomColor: colors.border },
                  item.code === selected.code && { backgroundColor: colors.primaryMuted },
                ]}
                onPress={() => handleSelect(item)}
                accessibilityLabel={`${item.name}, ${item.nativeName}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: item.code === selected.code }}
              >
                <Text style={[styles.langNative, { color: colors.text }]}>{item.nativeName}</Text>
                <Text style={[styles.langName, { color: colors.textSecondary }]}>{item.name}</Text>
                {item.code === selected.code && (
                  <Text style={{ color: colors.primary, fontSize: 18 }}>✓</Text>
                )}
              </TouchableOpacity>
            )}
            renderSectionHeader={({ section }) => (
              <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
                <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{section.title}</Text>
              </View>
            )}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            stickySectionHeadersEnabled
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    flex: 1,
  },
  triggerNative: { fontSize: 16, fontWeight: '500', flex: 1 },
  triggerName: { fontSize: 12 },
  chevron: { fontSize: 14 },
  modal: { flex: 1, paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  closeBtn: { fontSize: 16, fontWeight: '600' },
  searchContainer: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: { fontSize: 16 },
  sectionHeader: { paddingVertical: 6, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  langItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  langNative: { fontSize: 17, flex: 1 },
  langName: { fontSize: 13 },
});
