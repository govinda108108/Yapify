import { useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  Animated, Easing, StyleSheet, useWindowDimensions, ScrollView, Alert,
} from 'react-native';
import { colors, fonts } from '../../constants/theme';
import { MODES, ModeId } from './FAB';

type HistoryItem = {
  id: string;
  mode: ModeId;
  output: string;
  createdAt: number;
};

type Props = {
  visible: boolean;
  apiKey: string;
  globalPrompt: string;
  currentMode: ModeId;
  modePrompts: Record<ModeId, string>;
  history: HistoryItem[];
  overlayGranted: boolean;
  accessibilityEnabled: boolean;
  onApiKeyChange: (k: string) => void;
  onGlobalPromptChange: (prompt: string) => void;
  onModePromptChange: (modeId: ModeId, prompt: string) => void;
  onResetModePrompt: (modeId: ModeId) => void;
  onRestoreHistoryItem: (item: HistoryItem) => void;
  onClearHistory: () => void;
  onReopenOnboarding: () => void;
  onTestOverlay: () => void;
  onTestInject: () => void;
  onClose: () => void;
};

function ActionButton({
  label,
  onPress,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.actionButton, primary && styles.actionButtonPrimary]} onPress={onPress}>
      <Text style={[styles.actionButtonText, primary && styles.actionButtonTextPrimary]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function Settings({
  visible,
  apiKey,
  globalPrompt,
  currentMode,
  modePrompts,
  history,
  overlayGranted,
  accessibilityEnabled,
  onApiKeyChange,
  onGlobalPromptChange,
  onModePromptChange,
  onResetModePrompt,
  onRestoreHistoryItem,
  onClearHistory,
  onReopenOnboarding,
  onTestOverlay,
  onTestInject,
  onClose,
}: Props) {
  const { width } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(width)).current;

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: visible ? 0 : width,
      duration: 300,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: true,
    }).start();
  }, [translateX, visible, width]);

  const isLive = apiKey.startsWith('gsk_') || apiKey.startsWith('sk-');

  function confirmResetModePrompt(modeId: ModeId) {
    Alert.alert(
      'Reset Prompt?',
      `Reset the ${MODES[modeId].name} prompt back to its default text?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => onResetModePrompt(modeId) },
      ],
    );
  }

  function confirmClearHistory() {
    Alert.alert(
      'Clear History?',
      'Remove all saved outputs from Settings history?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: onClearHistory },
      ],
    );
  }

  return (
    <Animated.View style={[styles.panel, { transform: [{ translateX }] }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <TouchableOpacity onPress={onClose} hitSlop={12}>
          <Text style={styles.close}>X</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Setup</Text>
          <Text style={styles.cardDesc}>
            Reopen onboarding, verify overlay permission, and test accessibility injection.
          </Text>
          <View style={styles.setupRow}>
            <Text style={[styles.badge, overlayGranted && styles.badgeLive]}>
              {overlayGranted ? 'Overlay ready' : 'Overlay needed'}
            </Text>
            <Text style={[styles.badge, accessibilityEnabled && styles.badgeLive]}>
              {accessibilityEnabled ? 'Inject ready' : 'Inject needed'}
            </Text>
          </View>
          <View style={styles.actionRow}>
            <ActionButton label="Onboarding" onPress={onReopenOnboarding} primary />
            <ActionButton label="Test overlay" onPress={onTestOverlay} />
            <ActionButton label="Test inject" onPress={onTestInject} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>API Key</Text>
          <Text style={styles.cardDesc}>Groq (`gsk_...`) or OpenAI (`sk-...`)</Text>
          <TextInput
            style={styles.input}
            value={apiKey}
            onChangeText={onApiKeyChange}
            placeholder="Paste your API key..."
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.setupRow}>
            <Text style={[styles.badge, isLive && styles.badgeLive]}>
              {isLive ? 'Live' : 'No key'}
            </Text>
            <Text style={styles.badgeInfo}>
              {apiKey.startsWith('gsk_') ? 'Groq' : apiKey.startsWith('sk-') ? 'OpenAI' : ''}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Global System Prompt</Text>
          <Text style={styles.cardDesc}>
            Applied before the selected mode prompt for app and overlay recordings.
          </Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={globalPrompt}
            onChangeText={onGlobalPromptChange}
            placeholder="Example: Keep my tone direct. Avoid filler. Never invent facts."
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mode Prompts</Text>
          <Text style={styles.badgeInfo}>Current mode: {MODES[currentMode].name}</Text>
          <Text style={styles.cardDesc}>
            Edit each mode prompt directly. These changes also apply to the overlay service.
          </Text>
          {(Object.keys(MODES) as ModeId[]).map((modeId) => (
            <View key={modeId} style={styles.modeCard}>
              <View style={styles.modeHeaderRow}>
                <Text style={[styles.modeTitle, styles.modeTitleText]}>{MODES[modeId].name}</Text>
                <TouchableOpacity style={styles.inlineActionButton} onPress={() => confirmResetModePrompt(modeId)}>
                  <Text style={styles.inlineAction}>Reset</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.input, styles.modeTextarea]}
                value={modePrompts[modeId]}
                onChangeText={(text) => onModePromptChange(modeId, text)}
                multiline
                textAlignVertical="top"
                autoCorrect={false}
              />
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Outputs</Text>
          <Text style={styles.cardDesc}>
            Reopen a previous result card without re-recording.
          </Text>
          {history.length === 0 && (
            <Text style={styles.emptyText}>No saved outputs yet.</Text>
          )}
          {history.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.historyCard}
              onPress={() => onRestoreHistoryItem(item)}
            >
              <View style={styles.rowBetween}>
                <Text style={styles.historyMode}>{MODES[item.mode].name}</Text>
                <Text style={styles.historyTime}>
                  {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <Text style={styles.historyText} numberOfLines={3}>{item.output}</Text>
            </TouchableOpacity>
          ))}
          {history.length > 0 && (
            <View style={styles.actionRow}>
              <ActionButton label="Clear history" onPress={confirmClearHistory} />
            </View>
          )}
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
    gap: 10,
    marginBottom: 16,
  },
  modeCard: {
    backgroundColor: colors.surface2,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  cardTitle: {
    fontFamily: fonts.sans + '_Bold',
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  modeTitle: {
    fontFamily: fonts.sans + '_Bold',
    fontSize: 13,
    color: colors.text,
  },
  modeTitleText: {
    flex: 1,
    paddingRight: 12,
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
  textarea: {
    minHeight: 120,
    paddingTop: 10,
    paddingBottom: 10,
    lineHeight: 20,
  },
  modeTextarea: {
    minHeight: 100,
    paddingTop: 8,
    paddingBottom: 8,
    lineHeight: 18,
  },
  setupRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionButton: {
    backgroundColor: colors.surface2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionButtonPrimary: {
    backgroundColor: colors.teal,
  },
  actionButtonText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.text,
  },
  actionButtonTextPrimary: {
    color: colors.bg,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  modeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  inlineAction: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.teal,
  },
  inlineActionButton: {
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  historyCard: {
    backgroundColor: colors.surface2,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  historyMode: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.teal,
  },
  historyTime: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
  },
  historyText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.text,
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
});
