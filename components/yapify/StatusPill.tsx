import { useRef, useEffect } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../../constants/theme';

type Props = {
  message: string;
};

export default function StatusPill({ message }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: message ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [message]);

  return (
    <Animated.View style={[styles.pill, { opacity }]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: 'rgba(26,29,31,0.92)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    alignSelf: 'center',
  },
  text: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
});
