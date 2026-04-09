import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { colors, fonts } from '../../constants/theme';

type Props = {
  visible: boolean;
  apiKey: string;
  overlayGranted: boolean;
  accessibilityEnabled: boolean;
  onApiKeyChange: (value: string) => void;
  onRequestOverlay: () => void;
  onOpenAccessibility: () => void;
  onRefreshChecks: () => void;
  onContinue: () => void;
};

function StepRow({
  title,
  description,
  ready,
  actionLabel,
  onPress,
}: {
  title: string;
  description: string;
  ready: boolean;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.stepCard}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={[styles.status, ready && styles.statusReady]}>
          {ready ? 'Ready' : 'Needed'}
        </Text>
      </View>
      <Text style={styles.stepDesc}>{description}</Text>
      <TouchableOpacity style={styles.secondaryButton} onPress={onPress}>
        <Text style={styles.secondaryButtonText}>{actionLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function Onboarding({
  visible,
  apiKey,
  overlayGranted,
  accessibilityEnabled,
  onApiKeyChange,
  onRequestOverlay,
  onOpenAccessibility,
  onRefreshChecks,
  onContinue,
}: Props) {
  if (!visible) return null;

  const hasApiKey = apiKey.startsWith('gsk_') || apiKey.startsWith('sk-');
  const ready = hasApiKey && overlayGranted && accessibilityEnabled;

  return (
    <View style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>First Run Setup</Text>
          <Text style={styles.title}>Set up Yapify before you rely on the floating dot.</Text>
          <Text style={styles.subtitle}>
            Finish all three checks. The overlay flow is not complete until API, overlay, and injection are ready.
          </Text>
        </View>

        <View style={styles.stepCard}>
          <View style={styles.stepHeader}>
            <Text style={styles.stepTitle}>API Key</Text>
            <Text style={[styles.status, hasApiKey && styles.statusReady]}>
              {hasApiKey ? 'Ready' : 'Needed'}
            </Text>
          </View>
          <Text style={styles.stepDesc}>Groq (`gsk_...`) or OpenAI (`sk-...`).</Text>
          <TextInput
            style={styles.input}
            value={apiKey}
            onChangeText={onApiKeyChange}
            placeholder="Paste your API key..."
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <StepRow
          title="Overlay Permission"
          description="Lets Yapify keep the floating dot above other apps."
          ready={overlayGranted}
          actionLabel={overlayGranted ? 'Reopen overlay settings' : 'Enable overlay'}
          onPress={onRequestOverlay}
        />

        <StepRow
          title="Accessibility"
          description="Lets Yapify inject text into the active field from the result card."
          ready={accessibilityEnabled}
          actionLabel={accessibilityEnabled ? 'Reopen accessibility settings' : 'Enable accessibility'}
          onPress={onOpenAccessibility}
        />

        <TouchableOpacity style={styles.refreshButton} onPress={onRefreshChecks}>
          <Text style={styles.refreshButtonText}>Refresh checks</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryButton, !ready && styles.primaryButtonDisabled]}
          onPress={onContinue}
          disabled={!ready}
        >
          <Text style={[styles.primaryButtonText, !ready && styles.primaryButtonTextDisabled]}>
            Continue to app
          </Text>
        </TouchableOpacity>

        {!ready && (
          <Text style={styles.footer}>
            Continue unlocks only after all setup items show Ready.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    zIndex: 300,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 72,
    paddingBottom: 40,
    gap: 16,
  },
  hero: {
    marginBottom: 8,
    gap: 8,
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.teal,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.sans + '_Bold',
    fontSize: 28,
    lineHeight: 34,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 22,
    color: colors.muted,
  },
  stepCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  stepTitle: {
    fontFamily: fonts.sans + '_Bold',
    fontSize: 16,
    color: colors.text,
  },
  stepDesc: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
  },
  status: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.red,
    textTransform: 'uppercase',
  },
  statusReady: {
    color: colors.teal,
  },
  input: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.teal,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface2,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.text,
  },
  refreshButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.surface2,
  },
  refreshButtonText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.text,
  },
  primaryButton: {
    backgroundColor: colors.teal,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: colors.surface2,
  },
  primaryButtonText: {
    fontFamily: fonts.sans + '_Bold',
    fontSize: 14,
    color: colors.bg,
  },
  primaryButtonTextDisabled: {
    color: colors.muted,
  },
  footer: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
    textAlign: 'center',
  },
});
