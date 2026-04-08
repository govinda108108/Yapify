import { useRef, useEffect } from 'react';
import { View, Text, Animated, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts } from '../../constants/theme';

type Props = {
  processing: boolean;
  onStop: () => void;
};

export default function ToastEditBar({ processing, onStop }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!processing) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [processing]);

  if (processing) {
    return (
      <View style={[styles.bar, styles.processingBar]}>
        <Animated.View style={styles.spinner} />
        <Text style={styles.label}>Updating...</Text>
      </View>
    );
  }

  return (
    <View style={styles.bar}>
      <Animated.View style={[styles.dot, { opacity: pulse }]} />
      <Text style={styles.label}>Speak your edit...</Text>
      <TouchableOpacity onPress={onStop} hitSlop={8}>
        <Text style={styles.stop}>Stop</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: 'rgba(255,90,90,0.3)',
    borderRadius: 10,
    padding: 10,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  processingBar: {
    borderColor: 'rgba(46,196,182,0.2)',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.red,
  },
  label: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
  stop: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  spinner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: colors.teal,
    borderTopColor: 'transparent',
  },
});
