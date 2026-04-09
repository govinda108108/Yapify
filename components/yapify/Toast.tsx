import { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue, useAnimatedStyle, withTiming, runOnJS,
} from 'react-native-reanimated';
import { colors, fonts } from '../../constants/theme';
import { MODES, ModeId } from './FAB';
import ToastEditBar from './ToastEditBar';

type Props = {
  output: string;
  mode: ModeId;
  editing: boolean;
  editProcessing: boolean;
  topPosition: number;
  onInject: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onStopEdit: () => void;
  onDismiss: () => void;
};

export default function Toast({
  output,
  mode,
  editing,
  editProcessing,
  topPosition,
  onInject,
  onCopy,
  onEdit,
  onStopEdit,
  onDismiss,
}: Props) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-6);
  const toastTop = useSharedValue(topPosition);
  const toastLeft = useSharedValue(16);
  const isDragging = useSharedValue(false);
  const dragStartTop = useSharedValue(0);
  const dragStartLeft = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 200 });
    translateY.value = withTiming(0, { duration: 200 });
    toastTop.value = topPosition;
  }, [opacity, topPosition, toastTop, translateY]);

  useEffect(() => {
    if (!isDragging.value) {
      toastTop.value = withTiming(topPosition, { duration: 150 });
    }
  }, [isDragging, toastTop, topPosition]);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleGesture = Gesture.Pan()
    .minDistance(0)
    .onBegin(() => {
      'worklet';
      runOnJS(startHold)();
    })
    .onChange((e) => {
      'worklet';
      const dx = Math.abs(e.translationX);
      const dy = Math.abs(e.translationY);
      if (dx > 8 || dy > 8) {
        runOnJS(cancelHold)();
      }
      if (isDragging.value) {
        toastTop.value = Math.max(8, dragStartTop.value + e.translationY);
        toastLeft.value = Math.max(8, dragStartLeft.value + e.translationX);
      }
    })
    .onEnd(() => {
      'worklet';
      runOnJS(cancelHold)();
      isDragging.value = false;
    });

  function startHold() {
    holdTimer.current = setTimeout(() => {
      isDragging.value = true;
      dragStartTop.value = toastTop.value;
      dragStartLeft.value = toastLeft.value;
    }, 300);
  }

  function cancelHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  const toastStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: toastTop.value,
    left: toastLeft.value,
    right: isDragging.value ? undefined : 16,
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const { emoji, name } = MODES[mode];

  return (
    <Reanimated.View style={[styles.toast, toastStyle]}>
      <GestureDetector gesture={handleGesture}>
        <View style={styles.dragHandleHitArea}>
          <View style={styles.dragHandle} />
        </View>
      </GestureDetector>

      <View style={styles.labelRow}>
        <Text style={styles.label}>Output</Text>
        <View style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>{emoji} {name}</Text>
        </View>
      </View>

      <ScrollView style={styles.textScroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.outputText}>{output}</Text>
      </ScrollView>

      {editing && (
        <ToastEditBar processing={editProcessing} onStop={onStopEdit} />
      )}

      {!editing && (
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onInject}>
            <Text style={[styles.btnText, styles.btnTextPrimary]}>Insert</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={onCopy}>
            <Text style={styles.btnText}>Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={onEdit}>
            <Text style={styles.btnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={onDismiss}>
            <Text style={styles.btnText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(46,196,182,0.25)',
    borderRadius: 16,
    padding: 14,
    paddingHorizontal: 16,
    zIndex: 100,
  },
  dragHandleHitArea: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 2,
  },
  dragHandle: {
    width: 32,
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 2,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modeBadge: {
    backgroundColor: 'rgba(46,196,182,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(46,196,182,0.2)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  modeBadgeText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.teal,
  },
  textScroll: {
    maxHeight: 120,
    marginBottom: 10,
  },
  outputText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21.7,
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  btn: {
    minWidth: '23%',
    flexGrow: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.surface2,
    alignItems: 'center',
  },
  btnPrimary: {
    backgroundColor: 'rgba(46,196,182,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(46,196,182,0.3)',
  },
  btnText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.muted,
  },
  btnTextPrimary: {
    color: colors.teal,
  },
});
