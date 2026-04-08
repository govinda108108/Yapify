import { useEffect, useRef } from 'react';
import {
  View, Text, Animated, Image, StyleSheet, useWindowDimensions, Keyboard,
  ActivityIndicator,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';
import { colors, fonts } from '../../constants/theme';

export type FabState = 'IDLE' | 'EXPANDED' | 'SELECTING' | 'RECORDING' | 'PROCESSING';
export type ModeId = 'default' | 'email' | 'quick' | 'ai';

export const MODES: Record<ModeId, { emoji: string; name: string; prompt: string }> = {
  default: {
    emoji: '',
    name: 'Default',
    prompt: 'You are a transcription cleaner. Clean up this raw voice transcript into natural, flowing sentences. Fix grammar and punctuation. Join short fragmented sentences together where it sounds natural. Do NOT change the tone, word choices, or meaning. Do NOT add formatting, bullet points, or structure. Just return clean, readable prose that sounds exactly like the speaker.',
  },
  email: {
    emoji: '✉️',
    name: 'Email',
    prompt: 'You are an email formatter. Take this raw voice transcript and format it as a proper email with paragraphs. Add a greeting and sign-off. You may make very minor tonal adjustments only where needed for the email to read naturally -- but preserve the speaker\'s voice and meaning as closely as possible. Do not add information that wasn\'t in the transcript.',
  },
  quick: {
    emoji: '💬',
    name: 'Quick Message',
    prompt: 'You are a text message formatter. Take this raw voice transcript and rewrite it as a short, casual text message. Keep it brief and conversational. Preserve the speaker\'s tone and meaning exactly. No formatting, no bullet points, just a natural short message.',
  },
  ai: {
    emoji: '🤖',
    name: 'AI Prompt',
    prompt: 'The user is giving you a direct instruction. Execute it exactly as requested. Write the output in the user\'s tone of voice based on how they speak in the transcript. Return only the final output -- no commentary, no explanation.',
  },
};

type Props = {
  fabState: FabState;
  currentMode: ModeId;
  recordingSecs: number;
  onStateChange: (s: FabState) => void;
  onModeChange: (m: ModeId) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
};

const FAB_SIZE = 56;
const DOT_SIZE = 20;
const CHIP_MODES: ModeId[] = ['default', 'email', 'quick', 'ai'];

export default function FAB({
  fabState, currentMode, recordingSecs,
  onStateChange, onModeChange, onStartRecording, onStopRecording,
}: Props) {
  const { width: sw, height: sh } = useWindowDimensions();
  const fabX = useSharedValue(sw - 24 - FAB_SIZE);
  const fabY = useSharedValue(120);

  // Shared value mirror of fabState for worklets
  const fabStateShared = useSharedValue<string>('IDLE');
  useEffect(() => { fabStateShared.value = fabState; }, [fabState]);

  const bigScale = useSharedValue(0);
  const trayOpacity = useSharedValue(0);

  // Ripple animations
  const ripple1 = useRef(new Animated.Value(0)).current;
  const ripple2 = useRef(new Animated.Value(0)).current;
  const ripple3 = useRef(new Animated.Value(0)).current;
  const rippleLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Chip screen positions for hit testing (measured via measureInWindow)
  const chipRects = useRef<Record<ModeId, { x: number; y: number; w: number; h: number } | null>>(
    { default: null, email: null, quick: null, ai: null }
  );
  const chipViewRefs = useRef<Record<ModeId, View | null>>(
    { default: null, email: null, quick: null, ai: null }
  );
  const litModeRef = useRef<ModeId | null>(null);
  const litModeShared = useSharedValue<string>('');

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clamp(v: number, lo: number, hi: number) {
    'worklet';
    return Math.max(lo, Math.min(hi, v));
  }

  function moveFab(nx: number, ny: number) {
    'worklet';
    fabX.value = clamp(nx, 8, sw - FAB_SIZE - 8);
    fabY.value = clamp(ny, 50, sh - FAB_SIZE - 8);
  }

  // Keyboard avoidance
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', (e) => {
      const kbTop = sh - e.endCoordinates.height;
      if (fabY.value > kbTop - FAB_SIZE) {
        fabY.value = withTiming(Math.max(50, kbTop / 2 - FAB_SIZE));
      }
    });
    return () => sub.remove();
  }, [sh]);

  useEffect(() => {
    if (fabState === 'IDLE') {
      bigScale.value = withSpring(0, { damping: 20, stiffness: 300 });
      trayOpacity.value = withTiming(0, { duration: 150 });
      stopRipple();
    } else if (fabState === 'EXPANDED' || fabState === 'PROCESSING') {
      bigScale.value = withTiming(1, { duration: 180 });
      trayOpacity.value = withTiming(0, { duration: 150 });
      stopRipple();
    } else if (fabState === 'SELECTING') {
      bigScale.value = withTiming(1, { duration: 180 });
      trayOpacity.value = withTiming(1, { duration: 200 });
      measureChips();
    } else if (fabState === 'RECORDING') {
      bigScale.value = withTiming(1, { duration: 180 });
      trayOpacity.value = withTiming(0, { duration: 150 });
      startRipple();
    }
  }, [fabState]);

  function measureChips() {
    CHIP_MODES.forEach((mode) => {
      chipViewRefs.current[mode]?.measureInWindow((x, y, w, h) => {
        chipRects.current[mode] = { x, y, w, h };
      });
    });
  }

  function startRipple() {
    [ripple1, ripple2, ripple3].forEach(r => r.setValue(0));
    rippleLoop.current = Animated.loop(
      Animated.stagger(550, [
        Animated.timing(ripple1, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(ripple2, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(ripple3, { toValue: 1, duration: 1600, useNativeDriver: true }),
      ])
    );
    rippleLoop.current.start();
  }

  function stopRipple() {
    rippleLoop.current?.stop();
    [ripple1, ripple2, ripple3].forEach(r => r.setValue(0));
  }

  function hitTestChip(ax: number, ay: number): ModeId | null {
    for (const mode of CHIP_MODES) {
      const r = chipRects.current[mode];
      if (!r) continue;
      if (ax >= r.x - 30 && ax <= r.x + r.w + 30 && ay >= r.y - 16 && ay <= r.y + r.h + 16) {
        return mode;
      }
    }
    return null;
  }

  function updateLitMode(ax: number, ay: number) {
    const hit = hitTestChip(ax, ay);
    litModeRef.current = hit;
    litModeShared.value = hit ?? '';
  }

  function scheduleHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      onStateChange('SELECTING');
    }, 400);
  }

  function cancelHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function handleBigDotRelease(wasTap: boolean, ax: number, ay: number, currentState: string) {
    cancelHold();
    if (currentState === 'SELECTING') {
      const hit = hitTestChip(ax, ay) ?? litModeRef.current;
      if (hit) onModeChange(hit);
      litModeRef.current = null;
      litModeShared.value = '';
      onStateChange('EXPANDED');
      return;
    }
    if (!wasTap) return;
    if (currentState === 'EXPANDED') onStartRecording();
    else if (currentState === 'RECORDING') onStopRecording();
  }

  // Small dot gesture (IDLE)
  const smallDotGesture = Gesture.Pan()
    .minDistance(0)
    .onChange((e) => {
      'worklet';
      const dx = Math.abs(e.translationX), dy = Math.abs(e.translationY);
      if (dx > 5 || dy > 5) {
        moveFab(fabX.value + e.changeX, fabY.value + e.changeY);
      }
    })
    .onEnd((e) => {
      'worklet';
      const dx = Math.abs(e.translationX), dy = Math.abs(e.translationY);
      if (dx <= 5 && dy <= 5) runOnJS(onStateChange)('EXPANDED');
    });

  // Big dot gesture
  const bigDotGesture = Gesture.Pan()
    .minDistance(0)
    .onBegin(() => {
      'worklet';
      runOnJS(scheduleHold)();
    })
    .onChange((e) => {
      'worklet';
      const dx = Math.abs(e.translationX), dy = Math.abs(e.translationY);
      if (fabStateShared.value === 'SELECTING') {
        // In selecting mode: only hit test, never move FAB
        runOnJS(updateLitMode)(e.absoluteX, e.absoluteY);
      } else if (dx > 8 || dy > 8) {
        runOnJS(cancelHold)();
        moveFab(fabX.value + e.changeX, fabY.value + e.changeY);
      }
    })
    .onEnd((e) => {
      'worklet';
      const dx = Math.abs(e.translationX), dy = Math.abs(e.translationY);
      runOnJS(handleBigDotRelease)(dx <= 8 && dy <= 8, e.absoluteX, e.absoluteY, fabStateShared.value);
    });

  const fabContainerStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: fabX.value,
    top: fabY.value,
    width: FAB_SIZE,
    height: FAB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  }));

  const bigDotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bigScale.value }],
  }));

  const isRecording = fabState === 'RECORDING';
  const isProcessing = fabState === 'PROCESSING';

  const timerStr = `${Math.floor(recordingSecs / 60)}:${String(recordingSecs % 60).padStart(2, '0')}`;

  const TRAY_WIDTH = 164;
  // Tray right edge aligned to FAB right edge, sitting just above FAB
  const trayStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: fabX.value + FAB_SIZE - TRAY_WIDTH,
    top: fabY.value - (CHIP_MODES.length * 44) - 8,
    width: TRAY_WIDTH,
    opacity: trayOpacity.value,
  }));

  return (
    <>
      {/* Mode tray — screen-level absolute, not inside FAB container */}
      <Reanimated.View style={trayStyle} pointerEvents={fabState === 'SELECTING' ? 'none' : 'none'}>
        {CHIP_MODES.map((mode) => (
          <AnimatedChip
            key={mode}
            mode={mode}
            litModeShared={litModeShared}
            onRef={(r) => { chipViewRefs.current[mode] = r; }}
          />
        ))}
      </Reanimated.View>

      {/* FAB container */}
      <Reanimated.View style={fabContainerStyle}>
        {isRecording && <Text style={styles.timer}>{timerStr}</Text>}

        {fabState !== 'IDLE' && (
          <GestureDetector gesture={bigDotGesture}>
            <Reanimated.View style={[
              styles.bigDot,
              bigDotStyle,
              isRecording && styles.bigDotRecording,
              isProcessing && styles.bigDotProcessing,
            ]}>
              {[ripple1, ripple2, ripple3].map((r, i) => isRecording && (
                <Animated.View key={i} style={[styles.ripple, {
                  opacity: r.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
                  transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [1, 2.5] }) }],
                }]} />
              ))}
              {isProcessing ? (
                <ActivityIndicator size="small" color={colors.teal} />
              ) : currentMode === 'default' ? (
                <Image source={require('../../assets/yapify-logo.png')} style={styles.logoIcon} />
              ) : (
                <Text style={styles.modeEmoji}>{MODES[currentMode].emoji}</Text>
              )}
            </Reanimated.View>
          </GestureDetector>
        )}

        {fabState === 'IDLE' && (
          <GestureDetector gesture={smallDotGesture}>
            <Reanimated.View style={styles.smallDot} />
          </GestureDetector>
        )}
      </Reanimated.View>
    </>
  );
}

function AnimatedChip({ mode, litModeShared, onRef }: {
  mode: ModeId;
  litModeShared: Reanimated.SharedValue<string>;
  onRef: (r: View | null) => void;
}) {
  const chipStyle = useAnimatedStyle(() => {
    const lit = litModeShared.value === mode;
    return {
      borderColor: withTiming(lit ? colors.teal : colors.border, { duration: 100 }),
      backgroundColor: withTiming(lit ? 'rgba(46,196,182,0.15)' : colors.surface, { duration: 100 }),
      transform: [{ scale: withTiming(lit ? 1.04 : 1, { duration: 100 }) }],
    };
  });

  return (
    <Reanimated.View
      ref={onRef as any}
      style={[styles.chip, chipStyle]}
    >
      <View style={styles.chipRow}>
        <View style={styles.chipIconWrap}>
          {mode === 'default'
            ? <Image source={require('../../assets/yapify-logo.png')} style={styles.chipLogo} />
            : <Text style={styles.chipEmoji}>{MODES[mode].emoji}</Text>
          }
        </View>
        <Text style={styles.chipText} numberOfLines={1}>{MODES[mode].name}</Text>
      </View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  bigDot: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  bigDotRecording: {
    backgroundColor: colors.red,
    shadowColor: colors.red,
  },
  bigDotProcessing: {
    backgroundColor: colors.surface2,
    borderWidth: 2,
    borderColor: colors.teal,
  },
  smallDot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: colors.teal,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
    elevation: 4,
  },
  ripple: {
    position: 'absolute',
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(255,90,90,0.3)',
  },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 4,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipIconWrap: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLogo: {
    width: 22,
    height: 22,
  },
  chipEmoji: {
    fontSize: 17,
    lineHeight: 22,
    textAlign: 'center',
  },
  chipText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.text,
  },
  timer: {
    position: 'absolute',
    top: -28,
    alignSelf: 'center',
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.red,
  },
  modeEmoji: {
    fontSize: 22,
  },
  logoIcon: {
    width: 34,
    height: 34,
  },
});
