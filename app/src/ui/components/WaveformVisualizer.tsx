import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { Colors } from '@/ui/theme/colors';

interface Props {
  isActive: boolean;
  amplitudes?: number[]; // 0–1 per bar; defaults to animated placeholder
  barCount?: number;
  height?: number;
  color?: string;
}

const DEFAULT_BAR_COUNT = 24;

export function WaveformVisualizer({
  isActive,
  amplitudes,
  barCount = DEFAULT_BAR_COUNT,
  height = 48,
  color,
}: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;
  const barColor = color ?? colors.waveform;

  const bars = Array.from({ length: barCount }, (_, i) => i);

  return (
    <View style={[styles.container, { height }]} accessibilityLabel={isActive ? 'Recording in progress' : 'Microphone inactive'}>
      {bars.map((i) => (
        <AnimatedBar
          key={i}
          index={i}
          total={barCount}
          isActive={isActive}
          amplitude={amplitudes ? amplitudes[i] ?? 0 : undefined}
          maxHeight={height}
          color={barColor}
        />
      ))}
    </View>
  );
}

function AnimatedBar({
  index,
  total,
  isActive,
  amplitude,
  maxHeight,
  color,
}: {
  index: number;
  total: number;
  isActive: boolean;
  amplitude?: number;
  maxHeight: number;
  color: string;
}) {
  const height = useSharedValue(4);
  const minBarHeight = 4;
  const maxBarHeight = maxHeight * 0.9;

  useEffect(() => {
    if (!isActive) {
      cancelAnimation(height);
      height.value = withSpring(minBarHeight, { damping: 20, stiffness: 200 });
      return;
    }

    if (amplitude !== undefined) {
      // Real amplitude from mic
      height.value = withSpring(
        minBarHeight + amplitude * (maxBarHeight - minBarHeight),
        { damping: 15, stiffness: 300 },
      );
    } else {
      // Idle animation — bars animate at different phases
      const phase = (index / total) * Math.PI * 2;
      const delay = (index / total) * 400;

      height.value = withRepeat(
        withSequence(
          withTiming(minBarHeight, { duration: 0 }),
          withTiming(
            minBarHeight + Math.abs(Math.sin(phase + index * 0.5)) * (maxBarHeight - minBarHeight),
            { duration: 600 + delay },
          ),
          withTiming(minBarHeight + 4, { duration: 600 + delay }),
        ),
        -1,
        true,
      );
    }
  }, [isActive, amplitude]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
    borderRadius: height.value / 2,
  }));

  return (
    <Animated.View
      style={[styles.bar, animatedStyle, { backgroundColor: color }]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  bar: {
    width: 3,
    minHeight: 4,
    borderRadius: 2,
    opacity: 0.85,
  },
});
