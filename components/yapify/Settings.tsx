import { useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  Animated, Easing, StyleSheet, useWindowDimensions, ScrollView,
} from 'react-native';
import { colors, fonts } from '../../constants/theme';

type Props = {
  visible: boolean;
  apiKey: string;
  onApiKeyChange: (k: string) => void;
  onClose: () => void;
};

export default function Settings({ visible, apiKey, onApiKeyChange, onClose }: Props) {
  const { width } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(width)).current;

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: visible ? 0 : width,
      duration: 300,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: true,
    }).start();
  }, [visible, width]);

  const isLive = apiKey.startsWith('gsk_') || apiKey.startsWith('sk-');

  return (
    <Animated.View style={[styles.panel, { transform: [{ translateX }] }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <TouchableOpacity onPress={onClose} hitSlop={12}>
          <Text style={styles.close}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>API Key</Text>
          <Text style={styles.cardDesc}>Groq (gsk_...) or OpenAI (sk-...)</Text>
          <TextInput
            style={styles.input}
            value={apiKey}
            onChangeText={onApiKeyChange}
            placeholder="Paste your API key..."
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={false}
          />
          <View style={styles.badgeRow}>
            <Text style={[styles.badge, isLive && styles.badgeLive]}>
              {isLive ? '● Live' : '○ No key'}
            </Text>
            <Text style={styles.badgeInfo}>
              {apiKey.startsWith('gsk_') ? 'Groq' : apiKey.startsWith('sk-') ? 'OpenAI' : ''}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pipeline</Text>
          <Text style={styles.cardDesc}>
            Audio → Whisper large-v3-turbo → LLaMA 3.3 70b
          </Text>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    zIndex: 200,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontFamily: fonts.sans + '_Bold',
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  close: {
    fontSize: 18,
    color: colors.muted,
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    marginBottom: 16,
  },
  cardTitle: {
    fontFamily: fonts.sans + '_Bold',
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  cardDesc: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  input: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.teal,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  badge: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
  },
  badgeLive: {
    color: colors.teal,
  },
  badgeInfo: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
  },
});
