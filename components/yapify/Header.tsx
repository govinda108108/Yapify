import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts } from '../../constants/theme';

type Props = {
  onSettingsPress: () => void;
};

export default function Header({ onSettingsPress }: Props) {
  return (
    <View style={styles.header}>
      <View style={styles.left}>
        {/* Logo: concentric circles using nested Views */}
        <View style={styles.logo}>
          <View style={styles.logoOuter} />
          <View style={styles.logoMid} />
          <View style={styles.logoInner} />
        </View>
        <Text style={styles.wordmark}>Yapify</Text>
      </View>
      <TouchableOpacity onPress={onSettingsPress} hitSlop={12}>
        <Text style={styles.gear}>⚙</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoOuter: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.teal,
  },
  logoMid: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.teal,
    opacity: 0.3,
  },
  logoInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.teal,
    opacity: 0.9,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordmark: {
    fontFamily: fonts.sans + '_Bold',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: colors.text,
  },
  gear: {
    fontSize: 20,
    color: colors.muted,
  },
});
