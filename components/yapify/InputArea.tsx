import { useRef, useImperativeHandle, forwardRef } from 'react';
import { TextInput, StyleSheet, Animated } from 'react-native';
import { colors, fonts } from '../../constants/theme';

export type InputAreaRef = {
  injectText: (text: string) => void;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
};

const InputArea = forwardRef<InputAreaRef, Props>(({ value, onChange }, ref) => {
  const inputRef = useRef<TextInput>(null);
  const borderColor = useRef(new Animated.Value(0)).current;

  useImperativeHandle(ref, () => ({
    injectText(newText: string) {
      const separator = value.length > 0 && !value.endsWith('\n') ? '\n\n' : '';
      const prefix = value + separator;
      const chars = newText.split('');
      let i = 0;

      // Teal border glow during injection
      Animated.timing(borderColor, { toValue: 1, duration: 150, useNativeDriver: false }).start();

      const tick = () => {
        if (i < chars.length) {
          onChange(prefix + chars.slice(0, i + 1).join(''));
          i++;
          setTimeout(tick, 14);
        } else {
          Animated.timing(borderColor, { toValue: 0, duration: 300, useNativeDriver: false }).start();
          inputRef.current?.focus();
        }
      };
      tick();
    },
  }));

  const animatedBorder = borderColor.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.teal],
  });

  return (
    <Animated.View style={[styles.wrapper, { borderColor: animatedBorder }]}>
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={value}
        onChangeText={onChange}
        multiline
        placeholder="Tap to type, or use the dot to dictate..."
        placeholderTextColor={colors.muted}
        textAlignVertical="top"
      />
    </Animated.View>
  );
});

export default InputArea;

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    padding: 14,
    paddingHorizontal: 16,
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 24,
    color: colors.text,
    minHeight: 140,
  },
});
