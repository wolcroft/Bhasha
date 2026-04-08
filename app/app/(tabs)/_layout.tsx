import { Tabs } from 'expo-router';
import { useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/ui/theme/colors';

function TabIcon({ focused, color, size, name }: { focused: boolean; color: string; size: number; name: string }) {
  const icons: Record<string, string> = {
    translate: focused ? '⌨️' : '⌨',
    conversation: focused ? '💬' : '💬',
    camera: focused ? '📷' : '📷',
    settings: focused ? '⚙️' : '⚙',
  };
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
    </View>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="translate"
        options={{
          title: 'Translate',
          tabBarIcon: ({ color }) => null,
        }}
      />
      <Tabs.Screen
        name="conversation"
        options={{
          title: 'Conversation',
          tabBarIcon: ({ color }) => null,
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          title: 'Camera',
          tabBarIcon: ({ color }) => null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => null,
        }}
      />
    </Tabs>
  );
}
