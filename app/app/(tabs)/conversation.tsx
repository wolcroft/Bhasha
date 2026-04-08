import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/ui/theme/colors';
import { Typography } from '@/ui/theme/typography';
import { LanguagePicker } from '@/ui/components/LanguagePicker';
import { ConversationBubble, type ConversationMessage } from '@/ui/components/ConversationBubble';
import { VoiceRecordButton } from '@/ui/components/VoiceRecordButton';
import { LANGUAGES, type Language } from '@/utils/languages';
import { getSherpaTTS } from '@/engine/tts/SherpaTTS';
import { useEngine } from '@/engine/EngineContext';

const DEFAULT_LANG_A = LANGUAGES.find((l) => l.code === 'eng_Latn')!;
const DEFAULT_LANG_B = LANGUAGES.find((l) => l.code === 'hin_Deva')!;

type ActiveSide = 'A' | 'B';

export default function ConversationScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const engine = useEngine();
  const [langA, setLangA] = useState<Language>(DEFAULT_LANG_A);
  const [langB, setLangB] = useState<Language>(DEFAULT_LANG_B);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [activeSide, setActiveSide] = useState<ActiveSide>('A');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const handleTranscript = useCallback(
    async (text: string, side: ActiveSide) => {
      const srcLang = side === 'A' ? langA : langB;
      const tgtLang = side === 'A' ? langB : langA;

      let translated = text;
      try {
        const result = await engine.translate(text, srcLang.code, tgtLang.code);
        translated = result.translation;
      } catch (err) {
        console.warn('Conversation translation failed:', err);
      }

      const message: ConversationMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        original: text,
        translated,
        srcLang,
        tgtLang,
        side: side === 'A' ? 'left' : 'right',
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, message]);

      // Auto-speak translation
      const tts = getSherpaTTS(tgtLang.code);
      const sound = await tts.speak(translated);
      if (sound) {
        setPlayingId(message.id);
        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded || !status.isPlaying) {
            setPlayingId(null);
            sound.unloadAsync();
          }
        });
      }

      // Switch to the other side for turn-taking
      setActiveSide(side === 'A' ? 'B' : 'A');
    },
    [langA, langB, engine],
  );

  const handleSpeak = useCallback(async (msg: ConversationMessage) => {
    const tts = getSherpaTTS(msg.tgtLang.code);
    const sound = await tts.speak(msg.translated);
    if (sound) {
      setPlayingId(msg.id);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded || !status.isPlaying) {
          setPlayingId(null);
          sound.unloadAsync();
        }
      });
    }
  }, []);

  const handleClear = useCallback(() => {
    setMessages([]);
  }, []);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const messagesWithPlayState = messages.map((m) => ({
    ...m,
    isPlaying: m.id === playingId,
  }));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Text style={[Typography.h3, { color: colors.text }]}>Conversation</Text>
        {messages.length > 0 && (
          <TouchableOpacity onPress={handleClear} accessibilityLabel="Clear conversation">
            <Text style={{ color: colors.error, fontSize: 14 }}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Language selectors */}
      <View style={[styles.langBar, { borderBottomColor: colors.border }]}>
        <View style={[styles.langSide, { borderRightColor: colors.border }]}>
          <LanguagePicker selected={langA} onSelect={setLangA} excludeCode={langB.code} label="Language A" />
        </View>
        <Text style={[styles.vs, { color: colors.textMuted }]}>↔</Text>
        <View style={styles.langSide}>
          <LanguagePicker selected={langB} onSelect={setLangB} excludeCode={langA.code} label="Language B" />
        </View>
      </View>

      {/* Message list */}
      <FlatList
        ref={listRef}
        data={messagesWithPlayState}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConversationBubble message={item} onSpeak={handleSpeak} />
        )}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: 24 },
          messages.length === 0 && styles.emptyContent,
        ]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyIcon]}>💬</Text>
            <Text style={[Typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
              Tap a mic button below to start speaking.{'\n'}Translations appear here.
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Voice controls — split bottom bar */}
      <View style={[styles.voiceBar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
        {/* Side A mic */}
        <View style={[
          styles.voiceSide,
          { borderRightColor: colors.border },
          activeSide === 'A' && { backgroundColor: colors.primaryMuted },
        ]}>
          <Text style={[Typography.caption, { color: colors.textMuted, marginBottom: 4 }]}>
            {langA.nativeName}
          </Text>
          <VoiceRecordButton
            srcLangCode={langA.code}
            onTranscript={(text) => handleTranscript(text, 'A')}
            size={56}
          />
        </View>

        {/* Side B mic */}
        <View style={[
          styles.voiceSide,
          activeSide === 'B' && { backgroundColor: colors.primaryMuted },
        ]}>
          <Text style={[Typography.caption, { color: colors.textMuted, marginBottom: 4 }]}>
            {langB.nativeName}
          </Text>
          <VoiceRecordButton
            srcLangCode={langB.code}
            onTranscript={(text) => handleTranscript(text, 'B')}
            size={56}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  langBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  langSide: { flex: 1, borderRightWidth: 0 },
  vs: { fontSize: 18, fontWeight: '300' },
  listContent: { paddingTop: 8 },
  emptyContent: { flex: 1 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  emptyIcon: { fontSize: 48 },
  voiceBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  voiceSide: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
});
