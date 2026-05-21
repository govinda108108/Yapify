# Yapify

A voice-to-text Android app with AI processing. Tap the floating dot, speak, and your words are transcribed and reformatted by an LLM — then injected directly into any text field system-wide.

## How it works

1. Tap the floating teal dot to expand it
2. Tap again to start recording
3. Your audio is transcribed via Whisper
4. An LLM reformats the transcript based on your selected mode
5. The result appears in a floating card — inject it into any focused text field, copy it, or edit it with another voice recording

The dot lives over all other apps as a foreground service, so you can use Yapify without ever leaving what you're doing.

## Modes

Hold and drag the dot to pick a mode:

| Mode | What it does |
|---|---|
| Default | Cleans up raw speech into natural prose |
| Email | Formats as a proper email with greeting and sign-off |
| Quick Message | Rewrites as a short, casual text |
| AI Prompt | Executes your spoken instruction directly |

Each mode prompt is fully customizable from Settings.

## AI providers

Yapify works with either:
- **Groq** (`gsk_...` keys) — uses `whisper-large-v3-turbo` + `llama-3.3-70b-versatile`
- **OpenAI** (`sk-...` keys) — uses `whisper-1` + `gpt-4o-mini`

Your API key is stored locally in AsyncStorage and Android SharedPreferences. It is never hardcoded or sent anywhere except the provider's API.

## Permissions required

- `RECORD_AUDIO` — microphone access for recording
- `SYSTEM_ALERT_WINDOW` — overlay dot that floats over other apps
- `FOREGROUND_SERVICE_MICROPHONE` — recording from background
- `INTERNET` — API calls to Whisper and LLM
- Accessibility Service — for injecting text into any app's focused field

## Setup

1. Install the app via an EAS dev build (see below)
2. On first launch, the onboarding flow walks you through:
   - Entering your Groq or OpenAI API key
   - Granting overlay permission
   - Enabling the Yapify accessibility service

## Building

This project uses [EAS Build](https://docs.expo.dev/build/introduction/) for cloud compilation. Expo Go is not supported.

## Main Commands
```bash
npm install
npm install -g eas-cli
eas login

# Development build (Android)
eas build --platform android --profile development

# Preview build
eas build --platform android --profile preview

# Production build
eas build --platform android --profile production
```

After a dev build installs, start the Metro bundler so the app can load the JS bundle:

```bash
npx expo start --lan
```

## Tech stack

- React Native with Expo SDK 54
- Expo Router (file-based navigation)
- Kotlin native modules for overlay service, accessibility injection, and clipboard
- `expo-audio` for recording
- `react-native-reanimated` + `react-native-gesture-handler` for FAB animations
- AsyncStorage for settings persistence
