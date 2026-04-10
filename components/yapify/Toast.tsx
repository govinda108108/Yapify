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
  addingMore: boolean;
  addMoreProcessing: boolean;
  topPosition: number;
  onInject: () => void;
  onCopy: () => void;
  onAddMore: () => void;
  onEdit: () => void;
  onStopEdit: () => void;
  onStopAddMore: () => void;
  onDismiss: () => void;
};

export default function Toast({
  output,
  mode,
  editing,
  editProcessing,
  addingMore,
  addMoreProcessing,
  topPosition,
  onInject,
  onCopy,
  onAddMore,
  onEdit,
  onStopEdit,
  onStopAddMore,
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
  const busyMode = editing ? 'edit' : addingMore ? 'add' : null;
  const busyProcessing = editing ? editProcessing : addMoreProcessing;

  return (
    <Reanimated.View style={[styles.toast, toastStyle]}>
      <GestureDetector gesture={handleGesture}>
        <View style={styles.dragHandleHitArea}>
          <View style={styles.dragHandle} />
        </View>
      </GestureDetector>

      <View style={styles.labelRow}>
        <Text style={styles.label}>Output</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton} onPress={onCopy} hitSlop={12}>
            <Text style={styles.iconButtonText}>⧉</Text>
          </TouchableOpacity>
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>{emoji} {name}</Text>
          </View>
          <TouchableOpacity style={styles.dismissButton} onPress={onDismiss} hitSlop={14}>
            <Text style={styles.dismissButtonText}>×</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.textScroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.outputText}>{output}</Text>
      </ScrollView>

      {busyMode && (
        <ToastEditBar
          processing={busyProcessing}
          activeLabel={busyMode === 'edit' ? 'Speak your edit...' : 'Speak what to add...'}
          processingLabel={busyMode === 'edit' ? 'Updating...' : 'Adding more...'}
          onStop={busyMode === 'edit' ? onStopEdit : onStopAddMore}
        />
      )}

      {!busyMode && (
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onInject}>
            <Text style={[styles.btnText, styles.btnTextPrimary]}>Insert</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={onAddMore}>
            <Text style={styles.btnText}>Add more</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={onEdit}>
            <Text style={styles.btnText}>Edit</Text>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  iconButton: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: 'rgba(46,196,182,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.teal,
  },
  dismissButton: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(236,238,240,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(236,238,240,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButtonText: {
    fontFamily: fonts.sans,
    fontSize: 20,
    lineHeight: 22,
    color: colors.muted,
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
    gap: 8,
    marginTop: 2,
  },
  btn: {
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
