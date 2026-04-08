export const Animations = {
  // Duration constants (ms)
  instant: 100,
  fast: 200,
  normal: 300,
  slow: 500,

  // Spring configs for react-native-reanimated
  spring: {
    gentle: { damping: 20, stiffness: 150 },
    bouncy: { damping: 12, stiffness: 200 },
    snappy: { damping: 30, stiffness: 400 },
  },

  // Easing
  easeInOut: 'easeInOut',
  easeOut: 'easeOut',
};
