import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  DMSans_400Regular,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  DMMono_400Regular,
} from '@expo-google-fonts/dm-mono';

export default function RootLayout() {
  useFonts({
    DMSans: DMSans_400Regular,
    DMSans_Bold: DMSans_700Bold,
    DMMono: DMMono_400Regular,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
