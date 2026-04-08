/**
 * VoiceRecordButton — Animated press-and-hold / tap-to-toggle record button.
 * Shows waveform while recording. Calls onTranscript when STT is done.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Alert,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { Colors } from '@/ui/theme/colors';
import { WaveformVisualizer } from './WaveformVisualizer';
import {
  requestMicrophonePermission,
  startRecording,
  stopRecording,
} from '@/utils/audio';
import { getWhisperSTT } from '@/engine/stt/WhisperSTT';
import type { Recording } from 'expo-av/build/Audio';

interface Props {
  srcLangCode: string;
  onTranscript: (text: string) => void;
  size?: number;
}

export function VoiceRecordButton({ srcLangCode, onTranscript, size = 72 }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const recordingRef = useRef<Recording | null>(null);

  const scale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);

  const animatedBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const animatedRingStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: 1 + (1 - ringOpacity.value) * 0.4 }],
  }));

  const startPulse = () => {
    scale.value = withRepeat(withTiming(1.08, { duration: 600 }), -1, true);
    ringOpacity.value = withRepeat(withTiming(0, { duration: 1200 }), -1, false);
    ringOpacity.value = 1;
  };

  const stopPulse = () => {
    cancelAnimation(scale);
    cancelAnimation(ringOpacity);
    scale.value = withSpring(1, { damping: 15 });
    ringOpacity.value = withTiming(0, { duration: 200 });
  };

  const handlePress = useCallback(async () => {
    if (isProcessing) return;

    if (isRecording) {
      // Stop recording
      stopPulse();
      setIsRecording(false);
      setIsProcessing(true);

      const uri = recordingRef.current
        ? await stopRecording(recordingRef.current)
        : null;
      recordingRef.current = null;

      if (uri) {
        try {
          const langPrefix = srcLangCode.split('_')[0]; // 'hin', 'eng', etc.
          const whisperLang = LANG_TO_WHISPER[langPrefix] ?? null;
          const result = await getWhisperSTT('base').transcribe(uri, whisperLang);
          onTranscript(result.text);
        } catch (err) {
          Alert.alert('Transcription error', 'Could not process audio.');
        }
      }

      setIsProcessing(false);
    } else {
      // Start recording
      const granted = await requestMicrophonePermission();
      if (!granted) {
        Alert.alert(
          'Microphone access needed',
          'Allow microphone access in Settings to use voice input.',
        );
        return;
      }

      try {
        const recording = await startRecording();
        recordingRef.current = recording;
        setIsRecording(true);
        startPulse();
      } catch {
        Alert.alert('Error', 'Could not start recording.');
      }
    }
  }, [isRecording, isProcessing, srcLangCode, onTranscript]);

  const bgColor = isRecording ? colors.error : colors.primary;
  const label = isProcessing ? 'Processing…' : isRecording ? 'Tap to stop' : 'Tap to speak';

  return (
    <View style={styles.container}>
      {isRecording && (
        <WaveformVisualizer isActive={isRecording} height={36} />
      )}

      <View style={styles.btnWrapper}>
        {/* Pulse ring */}
        <Animated.View
          style={[
            styles.ring,
            { width: size + 24, height: size + 24, borderRadius: (size + 24) / 2, borderColor: bgColor },
            animatedRingStyle,
          ]}
        />

        {/* Main button */}
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={0.85}
          accessibilityLabel={label}
          accessibilityRole="button"
          accessibilityState={{ selected: isRecording }}
          disabled={isProcessing}
        >
          <Animated.View
            style={[
              styles.btn,
              { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor },
              animatedBtnStyle,
            ]}
          >
            <Text style={styles.btnIcon}>{isProcessing ? '⏳' : isRecording ? '⏹' : '🎙'}</Text>
          </Animated.View>
        </TouchableOpacity>
      </View>

      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const LANG_TO_WHISPER: Record<string, string> = {
  eng: 'en', hin: 'hi', ben: 'bn', tam: 'ta', tel: 'te',
  kan: 'kn', mal: 'ml', guj: 'gu', pan: 'pa', mar: 'mr',
  asm: 'as', urd: 'ur', npi: 'ne',
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 12 },
  btnWrapper: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    borderWidth: 2,
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  btnIcon: { fontSize: 30 },
  label: { fontSize: 13, fontWeight: '500' },
});
