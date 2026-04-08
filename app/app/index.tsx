import { useEffect } from 'react';
import { View, ActivityIndicator, useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { getSettings } from '@/models/storage';

export default function Index() {
  const colorScheme = useColorScheme();
  const colors = colorScheme === 'dark' ? Colors.dark : Colors.light;

  useEffect(() => {
    (async () => {
      const settings = await getSettings();
      if (settings.onboardingComplete) {
        router.replace('/(tabs)/translate');
      } else {
        router.replace('/onboarding');
      }
    })();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
