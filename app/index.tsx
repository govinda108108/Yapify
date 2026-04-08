import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, StyleSheet, NativeModules,
  Keyboard, useWindowDimensions, SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import { StatusBar } from 'expo-status-bar';

import { colors } from '../constants/theme';
import Header from '../components/yapify/Header';
import InputArea, { InputAreaRef } from '../components/yapify/InputArea';
import FAB, { FabState, ModeId, MODES } from '../components/yapify/FAB';
import Toast from '../components/yapify/Toast';
import Settings from '../components/yapify/Settings';
import StatusPill from '../components/yapify/StatusPill';
import ErrorToast from '../components/yapify/ErrorToast';

const { OverlayModule } = NativeModules;

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const OPENAI_BASE = 'https://api.openai.com/v1';

export default function YapifyScreen() {
  const { height: sh } = useWindowDimensions();
  const inputRef = useRef<InputAreaRef>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [fabState, setFabState] = useState<FabState>('IDLE');
  const [currentMode, setCurrentMode] = useState<ModeId>('default');
  const [toastOutput, setToastOutput] = useState<string | null>(null);
  const [toastEditing, setToastEditing] = useState(false);
  const [toastEditProcessing, setToastEditProcessing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [inputText, setInputText] = useState('');
  const [recordingSecs, setRecordingSecs] = useState(0);
  const [kbHeight, setKbHeight] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load persisted API key
  useEffect(() => {
    AsyncStorage.getItem('apiKey').then((k) => { if (k) setApiKey(k); });
  }, []);

  // Permissions + overlay
  useEffect(() => {
    AudioModule.requestRecordingPermissionsAsync();

    let poll: ReturnType<typeof setInterval> | null = null;
    (async () => {
      if (OverlayModule) {
        const hasPerm = await OverlayModule.hasPermission();
        if (!hasPerm) {
          OverlayModule.requestPermission();
          poll = setInterval(async () => {
            const granted = await OverlayModule.hasPermission();
            if (granted) {
              clearInterval(poll!);
              poll = null;
              OverlayModule.startOverlay();
            }
          }, 2000);
        } else {
          OverlayModule.startOverlay();
        }
      }
    })();

    const kbShow = Keyboard.addListener('keyboardDidShow', (e) => {
      setKbHeight(e.endCoordinates.height);
    });
    const kbHide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));

    return () => {
      if (poll) clearInterval(poll);
      kbShow.remove();
      kbHide.remove();
    };
  }, []);

  // Persist API key on change
  const handleApiKeyChange = useCallback((k: string) => {
    setApiKey(k);
    AsyncStorage.setItem('apiKey', k);
  }, []);

  function showError(msg: string) {
    setError(msg);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 3000);
  }

  // Recording
  async function startNativeRecording() {
    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
  }

  async function stopNativeRecording(): Promise<string | null> {
    await audioRecorder.stop();
    const uri = audioRecorder.uri;
    if (!uri) return null;
    return uri;
  }

  async function cancelNativeRecording() {
    try { await audioRecorder.stop(); } catch { /* ignore */ }
  }

  // Timer
  function startTimer() {
    setRecordingSecs(0);
    timerRef.current = setInterval(() => setRecordingSecs((s) => s + 1), 1000);
  }

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecordingSecs(0);
  }

  async function handleStartRecording() {
    try {
      await startNativeRecording();
      setFabState('RECORDING');
      startTimer();
    } catch {
      showError('Could not start recording');
    }
  }

  async function handleStopRecording() {
    stopTimer();
    setFabState('PROCESSING');
    try {
      const uri = await stopNativeRecording();
      if (!uri) {
        showError('No audio detected');
        setFabState('EXPANDED');
        return;
      }
      await runPipeline(uri);
    } catch (e: any) {
      showError(e?.message || 'Recording failed');
      setFabState('EXPANDED');
    }
  }

  // AI pipeline
  function getBase(key: string) {
    return key.startsWith('sk-') ? OPENAI_BASE : GROQ_BASE;
  }

  async function transcribe(uri: string): Promise<string> {
    const form = new FormData();
    const model = apiKey.startsWith('sk-') ? 'whisper-1' : 'whisper-large-v3-turbo';
    form.append('file', { uri, name: 'audio.m4a', type: 'audio/m4a' } as any);
    form.append('model', model);
    const res = await fetch(`${getBase(apiKey)}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const data = await res.json();
    if (!data.text) throw new Error(data.error?.message || 'Transcription failed');
    return data.text;
  }

  async function llm(systemPrompt: string, userContent: string): Promise<string> {
    const model = apiKey.startsWith('sk-') ? 'gpt-4o-mini' : 'llama-3.3-70b-versatile';
    const res = await fetch(`${getBase(apiKey)}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        max_tokens: 1024,
        temperature: 0.4,
      }),
    });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error(data.error?.message || 'LLM failed');
    return text;
  }

  async function runPipeline(uri: string) {
    if (!apiKey.startsWith('gsk_') && !apiKey.startsWith('sk-')) {
      showError('No API key -- open settings');
      setFabState('EXPANDED');
      return;
    }
    try {
      const transcript = await transcribe(uri);
      const output = await llm(MODES[currentMode].prompt, transcript);
      setToastOutput(output);
      setFabState('IDLE');
    } catch (e: any) {
      showError(e.message || 'Pipeline error');
      setFabState('EXPANDED');
    }
  }

  async function runEditPipeline(uri: string) {
    if (!toastOutput) return;
    setToastEditProcessing(true);
    try {
      const instruction = await transcribe(uri);
      const editPrompt = 'You are an editor. The user will give you a piece of text and a spoken instruction for how to change it. Apply the instruction and return only the updated text -- no commentary, no explanation, no preamble.';
      const updated = await llm(editPrompt, `Text:\n${toastOutput}\n\nEdit instruction: ${instruction}`);
      setToastOutput(updated);
    } catch (e: any) {
      showError(e.message || 'Edit failed');
    } finally {
      setToastEditing(false);
      setToastEditProcessing(false);
    }
  }

  async function handleStartEdit() {
    setToastEditing(true);
    try {
      await startNativeRecording();
    } catch {
      showError('Could not start recording');
      setToastEditing(false);
    }
  }

  async function handleStopEdit() {
    try {
      const uri = await stopNativeRecording();
      if (!uri) {
        showError('No audio detected');
        setToastEditing(false);
        return;
      }
      await runEditPipeline(uri);
    } catch {
      showError('Edit recording failed');
      setToastEditing(false);
    }
  }

  async function handleInject() {
    if (!toastOutput) return;
    const { AccessibilityModule } = NativeModules;
    if (AccessibilityModule) {
      const enabled = await AccessibilityModule.isEnabled();
      if (!enabled) {
        // Prompt once to enable accessibility service
        showError('Enable Yapify in Settings > Accessibility to insert anywhere');
        AccessibilityModule.openSettings();
        return;
      }
      const hasField = await AccessibilityModule.hasActiveField();
      if (hasField) {
        const ok = await AccessibilityModule.injectText(toastOutput);
        if (ok) { setToastOutput(null); return; }
      }
    }
    // Fallback: insert into Yapify's own textarea
    setToastOutput(null);
    inputRef.current?.injectText(toastOutput);
  }

  // Status pill message
  const statusMsg = (() => {
    if (fabState === 'EXPANDED') return `${MODES[currentMode].emoji} ${MODES[currentMode].name} · tap to record`;
    if (fabState === 'SELECTING') return 'drag to a mode · release to select';
    if (fabState === 'RECORDING') return 'recording · tap to stop';
    if (fabState === 'PROCESSING') return 'transcribing...';
    return '';
  })();

  // Toast position: below input area, or top if keyboard is up
  const toastTop = kbHeight > 0 ? 60 : sh * 0.55;

  return (
    <SafeAreaView style={styles.container}>
        <StatusBar hidden />

        <Header onSettingsPress={() => setSettingsOpen(true)} />

        <InputArea ref={inputRef} value={inputText} onChange={setInputText} />

        {/* FAB layer */}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <FAB
            fabState={fabState}
            currentMode={currentMode}
            recordingSecs={recordingSecs}
            onStateChange={setFabState}
            onModeChange={setCurrentMode}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
          />

          {/* Status pill anchored below FAB area */}
          <View style={styles.pillAnchor}>
            <StatusPill message={statusMsg} />
          </View>
        </View>

        {/* Toast */}
        {toastOutput !== null && (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <Toast
              output={toastOutput}
              mode={currentMode}
              editing={toastEditing}
              editProcessing={toastEditProcessing}
              topPosition={toastTop}
              onInject={handleInject}
              onEdit={handleStartEdit}
              onStopEdit={handleStopEdit}
              onDismiss={() => {
                cancelNativeRecording();
                setToastEditing(false);
                setToastOutput(null);
              }}
            />
          </View>
        )}

        {/* Settings */}
        <Settings
          visible={settingsOpen}
          apiKey={apiKey}
          onApiKeyChange={handleApiKeyChange}
          onClose={() => setSettingsOpen(false)}
        />

        {/* Error toast */}
        <ErrorToast message={error} onDismiss={() => setError(null)} />
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  pillAnchor: {
    position: 'absolute',
    bottom: 170,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
