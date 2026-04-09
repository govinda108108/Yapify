import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, StyleSheet, NativeModules, AppState, DeviceEventEmitter,
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
import Onboarding from '../components/yapify/Onboarding';

const { OverlayModule, AccessibilityModule, ClipboardModule } = NativeModules;

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const OPENAI_BASE = 'https://api.openai.com/v1';
const STORAGE_API_KEY = 'apiKey';
const STORAGE_GLOBAL_PROMPT = 'globalSystemPrompt';
const STORAGE_ONBOARDING_DONE = 'onboardingComplete';
const STORAGE_SELECTED_MODE = 'selectedMode';
const STORAGE_MODE_PROMPTS = 'modePrompts';
const STORAGE_HISTORY = 'outputHistory';
const HISTORY_LIMIT = 12;

type ModePromptMap = Record<ModeId, string>;
type HistoryItem = {
  id: string;
  mode: ModeId;
  output: string;
  createdAt: number;
};

const DEFAULT_MODE_PROMPTS: ModePromptMap = {
  default: MODES.default.prompt,
  email: MODES.email.prompt,
  quick: MODES.quick.prompt,
  ai: MODES.ai.prompt,
};

function isValidApiKey(value: string) {
  return value.startsWith('gsk_') || value.startsWith('sk-');
}

export default function YapifyScreen() {
  const { height: sh } = useWindowDimensions();
  const inputRef = useRef<InputAreaRef>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [fabState, setFabState] = useState<FabState>('IDLE');
  const [currentMode, setCurrentMode] = useState<ModeId>('default');
  const [modePrompts, setModePrompts] = useState<ModePromptMap>(DEFAULT_MODE_PROMPTS);
  const [toastOutput, setToastOutput] = useState<string | null>(null);
  const [toastEditing, setToastEditing] = useState(false);
  const [toastEditProcessing, setToastEditProcessing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [globalPrompt, setGlobalPrompt] = useState('');
  const [inputText, setInputText] = useState('');
  const [recordingSecs, setRecordingSecs] = useState(0);
  const [kbHeight, setKbHeight] = useState(0);
  const [overlayGranted, setOverlayGranted] = useState(false);
  const [accessibilityEnabled, setAccessibilityEnabled] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshNativeAccess = useCallback(async () => {
    if (OverlayModule) {
      const granted = await OverlayModule.hasPermission();
      setOverlayGranted(Boolean(granted));
    }
    if (AccessibilityModule) {
      const enabled = await AccessibilityModule.isEnabled();
      setAccessibilityEnabled(Boolean(enabled));
    }
  }, []);

  useEffect(() => {
    AsyncStorage.multiGet([
      STORAGE_API_KEY,
      STORAGE_GLOBAL_PROMPT,
      STORAGE_ONBOARDING_DONE,
      STORAGE_SELECTED_MODE,
      STORAGE_MODE_PROMPTS,
      STORAGE_HISTORY,
    ]).then((entries) => {
      const values = Object.fromEntries(entries);
      const savedKey = values[STORAGE_API_KEY] ?? '';
      const savedPrompt = values[STORAGE_GLOBAL_PROMPT] ?? '';
      const onboardingDone = values[STORAGE_ONBOARDING_DONE] === 'true';
      const savedMode = values[STORAGE_SELECTED_MODE] as ModeId | null;
      const savedModePrompts = values[STORAGE_MODE_PROMPTS];
      const savedHistory = values[STORAGE_HISTORY];

      if (savedKey) {
        setApiKey(savedKey);
        OverlayModule?.saveApiKey(savedKey);
      }
      if (savedPrompt) {
        setGlobalPrompt(savedPrompt);
        OverlayModule?.saveGlobalPrompt(savedPrompt);
      }
      if (savedMode && MODES[savedMode]) {
        setCurrentMode(savedMode);
        OverlayModule?.saveSelectedMode(savedMode);
      }
      if (savedModePrompts) {
        try {
          const parsed = JSON.parse(savedModePrompts);
          const merged = { ...DEFAULT_MODE_PROMPTS, ...parsed } as ModePromptMap;
          setModePrompts(merged);
          (Object.keys(merged) as ModeId[]).forEach((modeId) => {
            OverlayModule?.saveModePrompt(modeId, merged[modeId]);
          });
        } catch {
          setModePrompts(DEFAULT_MODE_PROMPTS);
        }
      }
      if (savedHistory) {
        try {
          setHistory(JSON.parse(savedHistory));
        } catch {
          setHistory([]);
        }
      }
      if (!onboardingDone) setOnboardingVisible(true);
    });

    refreshNativeAccess();
  }, [refreshNativeAccess]);

  useEffect(() => {
    AudioModule.requestRecordingPermissionsAsync();

    const autoRecordSub = DeviceEventEmitter.addListener('autoRecord', () => {
      setFabState('EXPANDED');
      setTimeout(() => handleStartRecording(), 300);
    });

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        OverlayModule?.stopOverlay();
        refreshNativeAccess();
      } else if (state === 'background' && OverlayModule) {
        OverlayModule.hasPermission().then((granted: boolean) => {
          setOverlayGranted(Boolean(granted));
          if (granted) OverlayModule.startOverlay();
        });
      }
    });

    const kbShow = Keyboard.addListener('keyboardDidShow', (e) => {
      setKbHeight(e.endCoordinates.height);
    });
    const kbHide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));

    return () => {
      autoRecordSub.remove();
      appState.remove();
      kbShow.remove();
      kbHide.remove();
    };
  }, [refreshNativeAccess]);

  const persistHistory = useCallback((items: HistoryItem[]) => {
    setHistory(items);
    AsyncStorage.setItem(STORAGE_HISTORY, JSON.stringify(items));
  }, []);

  const appendHistory = useCallback((output: string, mode: ModeId) => {
    const item: HistoryItem = {
      id: `${Date.now()}`,
      mode,
      output,
      createdAt: Date.now(),
    };
    const next = [item, ...history].slice(0, HISTORY_LIMIT);
    persistHistory(next);
  }, [history, persistHistory]);

  const handleApiKeyChange = useCallback((value: string) => {
    setApiKey(value);
    AsyncStorage.setItem(STORAGE_API_KEY, value);
    OverlayModule?.saveApiKey(value);
  }, []);

  const handleGlobalPromptChange = useCallback((value: string) => {
    setGlobalPrompt(value);
    AsyncStorage.setItem(STORAGE_GLOBAL_PROMPT, value);
    OverlayModule?.saveGlobalPrompt(value);
  }, []);

  const handleModePromptChange = useCallback((modeId: ModeId, prompt: string) => {
    setModePrompts((prev) => {
      const next = { ...prev, [modeId]: prompt };
      AsyncStorage.setItem(STORAGE_MODE_PROMPTS, JSON.stringify(next));
      OverlayModule?.saveModePrompt(modeId, prompt);
      return next;
    });
  }, []);

  const handleResetModePrompt = useCallback((modeId: ModeId) => {
    handleModePromptChange(modeId, DEFAULT_MODE_PROMPTS[modeId]);
  }, [handleModePromptChange]);

  const handleModeChange = useCallback((modeId: ModeId) => {
    setCurrentMode(modeId);
    AsyncStorage.setItem(STORAGE_SELECTED_MODE, modeId);
    OverlayModule?.saveSelectedMode(modeId);
  }, []);

  const handleFinishOnboarding = useCallback(() => {
    if (!isValidApiKey(apiKey) || !overlayGranted || !accessibilityEnabled) {
      showError('Finish setup before continuing');
      return;
    }
    setOnboardingVisible(false);
    AsyncStorage.setItem(STORAGE_ONBOARDING_DONE, 'true');
  }, [accessibilityEnabled, apiKey, overlayGranted]);

  const handleReopenOnboarding = useCallback(() => {
    setSettingsOpen(false);
    setOnboardingVisible(true);
  }, []);

  function composeSystemPrompt(modePrompt: string) {
    const trimmed = globalPrompt.trim();
    return trimmed ? `${trimmed}\n\nMode-specific instruction:\n${modePrompt}` : modePrompt;
  }

  function showError(msg: string) {
    setError(msg);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 3000);
  }

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

  function startTimer() {
    setRecordingSecs(0);
    timerRef.current = setInterval(() => setRecordingSecs((s) => s + 1), 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
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
    if (!isValidApiKey(apiKey)) {
      showError('No API key -- open settings');
      setFabState('EXPANDED');
      return;
    }
    try {
      const transcript = await transcribe(uri);
      const output = await llm(composeSystemPrompt(modePrompts[currentMode]), transcript);
      setToastOutput(output);
      appendHistory(output, currentMode);
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
      const updated = await llm(
        composeSystemPrompt(editPrompt),
        `Text:\n${toastOutput}\n\nEdit instruction: ${instruction}`,
      );
      setToastOutput(updated);
      appendHistory(updated, currentMode);
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
    if (AccessibilityModule) {
      const enabled = await AccessibilityModule.isEnabled();
      setAccessibilityEnabled(Boolean(enabled));
      if (!enabled) {
        showError('Enable Yapify in Settings > Accessibility to insert anywhere');
        AccessibilityModule.openSettings();
        return;
      }
      const hasField = await AccessibilityModule.hasActiveField();
      if (hasField) {
        const ok = await AccessibilityModule.injectText(toastOutput);
        if (ok) {
          setToastOutput(null);
          return;
        }
      }
    }
    setToastOutput(null);
    inputRef.current?.injectText(toastOutput);
  }

  async function handleCopyOutput() {
    if (!toastOutput) return;
    const ok = await ClipboardModule?.copyText?.(toastOutput);
    if (!ok) {
      showError('Could not copy text');
      return;
    }
    showError('Copied');
  }

  async function handleTestInject() {
    if (!AccessibilityModule) {
      showError('Accessibility bridge unavailable');
      return;
    }
    const enabled = await AccessibilityModule.isEnabled();
    setAccessibilityEnabled(Boolean(enabled));
    if (!enabled) {
      showError('Enable accessibility first');
      AccessibilityModule.openSettings();
      return;
    }
    const hasField = await AccessibilityModule.hasActiveField();
    if (!hasField) {
      showError('Focus a text field in another app first');
      return;
    }
    const ok = await AccessibilityModule.injectText('Yapify test inject');
    showError(ok ? 'Injected test text' : 'Inject test failed');
  }

  async function handleTestOverlay() {
    if (!OverlayModule) {
      showError('Overlay bridge unavailable');
      return;
    }
    const granted = await OverlayModule.hasPermission();
    setOverlayGranted(Boolean(granted));
    if (!granted) {
      showError('Enable overlay first');
      OverlayModule.requestPermission();
      return;
    }
    showError('Overlay is ready. Background the app to see the dot.');
  }

  const statusMsg = (() => {
    if (fabState === 'EXPANDED') return `${MODES[currentMode].emoji} ${MODES[currentMode].name} tap to record`;
    if (fabState === 'SELECTING') return 'drag to a mode and release to select';
    if (fabState === 'RECORDING') return 'recording tap to stop';
    if (fabState === 'PROCESSING') return 'transcribing...';
    return '';
  })();

  const toastTop = kbHeight > 0 ? 60 : sh * 0.55;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden />

      <Header onSettingsPress={() => setSettingsOpen(true)} />

      <InputArea ref={inputRef} value={inputText} onChange={setInputText} />

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <FAB
          fabState={fabState}
          currentMode={currentMode}
          recordingSecs={recordingSecs}
          onStateChange={setFabState}
          onModeChange={handleModeChange}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
        />

        <View style={styles.pillAnchor}>
          <StatusPill message={statusMsg} />
        </View>
      </View>

      {toastOutput !== null && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Toast
            output={toastOutput}
            mode={currentMode}
            editing={toastEditing}
            editProcessing={toastEditProcessing}
            topPosition={toastTop}
            onInject={handleInject}
            onCopy={handleCopyOutput}
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

      <Settings
        visible={settingsOpen}
        apiKey={apiKey}
        globalPrompt={globalPrompt}
        currentMode={currentMode}
        modePrompts={modePrompts}
        history={history}
        overlayGranted={overlayGranted}
        accessibilityEnabled={accessibilityEnabled}
        onApiKeyChange={handleApiKeyChange}
        onGlobalPromptChange={handleGlobalPromptChange}
        onModePromptChange={handleModePromptChange}
        onResetModePrompt={handleResetModePrompt}
        onRestoreHistoryItem={(item) => {
          setToastOutput(item.output);
          handleModeChange(item.mode);
        }}
        onClearHistory={() => persistHistory([])}
        onReopenOnboarding={handleReopenOnboarding}
        onTestOverlay={handleTestOverlay}
        onTestInject={handleTestInject}
        onClose={() => setSettingsOpen(false)}
      />

      <Onboarding
        visible={onboardingVisible}
        apiKey={apiKey}
        overlayGranted={overlayGranted}
        accessibilityEnabled={accessibilityEnabled}
        onApiKeyChange={handleApiKeyChange}
        onRequestOverlay={() => OverlayModule?.requestPermission()}
        onOpenAccessibility={() => AccessibilityModule?.openSettings()}
        onRefreshChecks={refreshNativeAccess}
        onContinue={handleFinishOnboarding}
      />

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
