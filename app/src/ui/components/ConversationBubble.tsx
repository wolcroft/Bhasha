import React from 'react';
import { View, Text, StyleSheet, useColorScheme, TouchableOpacity } from 'react-native';
import { Colors } from '@/ui/theme/colors';
import type { Language } from '@/utils/languages';

export type BubbleSide = 'left' | 'right';

export interface ConversationMessage {
  id: string;
  original: string;
  translated: string;
  srcLang: Language;
  tgtLang: Language;
  side: BubbleSide;
  timestamp: number;
  isPlaying?: boolean;
}

interface Props {
  message: ConversationMessage;
  onSpeak?: (message: ConversationMessage) => void;
}

export function ConversationBubble({ message, onSpeak }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;

  const isRight = message.side === 'right';
  const bubbleColor = isRight ? colors.primary : colors.surfaceElevated;
  const textColor = isRight ? '#FFFFFF' : colors.text;
  const subTextColor = isRight ? 'rgba(255,255,255,0.75)' : colors.textSecondary;

  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={[styles.row, isRight ? styles.rowRight : styles.rowLeft]}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: bubbleColor },
          isRight ? styles.bubbleRight : styles.bubbleLeft,
        ]}
        accessible
        accessibilityLabel={`${message.srcLang.name}: ${message.original}. ${message.tgtLang.name}: ${message.translated}`}
      >
        {/* Original text */}
        <Text
          style={[
            styles.originalText,
            { color: textColor },
            message.srcLang.rtl && { textAlign: 'right' },
          ]}
        >
          {message.original}
        </Text>

        {/* Translation */}
        <View style={styles.divider} />
        <Text
          style={[
            styles.translatedText,
            { color: subTextColor },
            message.tgtLang.rtl && { textAlign: 'right' },
          ]}
        >
          {message.translated}
        </Text>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.timestamp, { color: subTextColor }]}>{time}</Text>
          {onSpeak && (
            <TouchableOpacity
              onPress={() => onSpeak(message)}
              accessibilityLabel="Play translation"
              accessibilityRole="button"
            >
              <Text style={[styles.speakBtn, { color: subTextColor }]}>
                {message.isPlaying ? '⏸' : '▶'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginVertical: 6, paddingHorizontal: 16 },
  rowLeft: { alignItems: 'flex-start' },
  rowRight: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    borderRadius: 18,
    padding: 14,
    gap: 6,
  },
  bubbleLeft: { borderTopLeftRadius: 4 },
  bubbleRight: { borderTopRightRadius: 4 },
  originalText: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(128,128,128,0.25)' },
  translatedText: { fontSize: 14, lineHeight: 20 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  timestamp: { fontSize: 11 },
  speakBtn: { fontSize: 16 },
});
