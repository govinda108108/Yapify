import { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../../constants/theme';

type Props = {
  message: string | null;
  onDismiss: () => void;
};

export default function ErrorToast({ message, onDismiss }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (message) {
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(
          () => onDismiss()
        );
      }, 3000);
    } else {
      opacity.setValue(0);
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [message]);

  if (!message) return null;

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 54,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,90,90,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,90,90,0.3)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
    zIndex: 300,
  },
  text: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.red,
  },
});
