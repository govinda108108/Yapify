# Yapify — Claude Code Project Brief

## What is Yapify?
Yapify is a voice-to-text app with AI processing. The user records their voice, it transcribes via Whisper, then an LLM cleans/reformats the text based on a selected mode. The result appears in a floating overlay card that can be injected into any text field system-wide.

## Current State (April 2026)
- Full React Native app is working (Phase 3 complete)
- Floating overlay dot works system-wide over other apps
- **Active work:** Making the dot fully self-contained -- tap dot to record, transcribe, LLM process, show result card, inject at cursor -- all WITHOUT opening the Yapify app
- EAS builds are currently failing with a Gradle error (under investigation)

## Tech Stack
- **Framework:** React Native with Expo SDK 54, expo-router
- **Build:** EAS Build cloud compilation -- dev builds only, not Expo Go
- **AI:** Groq API (gsk_ keys) or OpenAI (sk- keys)
  - Transcription: Groq `whisper-large-v3-turbo` / OpenAI `whisper-1`
  - LLM: Groq `llama-3.3-70b-versatile` / OpenAI `gpt-4o-mini`
- **Target:** Android only
- **Dev environment:** Termux on the Android device itself

## Design System
```
--bg:       #0e1012
--surface:  #1a1d1f
--surface2: #22262a
--border:   #2c3035
--text:     #eceef0
--muted:    #8a9199
--teal:     #2ec4b6
--teal2:    #1a9e94
--red:      #ff5a5a
Fonts: DM Sans (body), DM Mono (labels/mono)
```

## Architecture

### React Native App (app/index.tsx)
Full native UI -- not a WebView. Key flows:
- FAB dot (teal, draggable) expands on tap, records audio via `expo-audio`
- 4 modes selectable by hold+drag: Default, Email, Quick Message, AI Prompt
- After recording: Whisper transcription → LLM → output toast
- Toast has: Inject | Edit (voice) | Dismiss
- Settings panel: API key input (persisted to AsyncStorage + native SharedPreferences)
- Overlay dot shown over other apps when app is backgrounded; hidden when app is active

### Overlay System (Native Android Kotlin)
The floating dot works as a standalone foreground service independent of the app:

**Flow when app is in background:**
1. User taps green dot → `OverlayService` starts recording via `MediaRecorder`
2. Dot turns red (recording), gray (processing)
3. Service calls Whisper + LLM directly via `HttpURLConnection`
4. Result shown in floating card with "Inject" + "Dismiss" buttons
5. Inject calls `YapifyAccessibilityService.injectText()` to paste at last focused cursor

**API key sharing:** API key is stored in SharedPreferences (`yapify_prefs` / `api_key`) via `ApiKeyStore`. The JS side calls `OverlayModule.saveApiKey(key)` on load and on change, so the native service can read it without the app being open.

### Accessibility Service
`YapifyAccessibilityService` tracks the last focused editable text field across all apps. `injectText()` uses clipboard paste to inject at cursor. User must enable in Settings > Accessibility > Yapify.

## Native Files
```
android/app/src/main/java/com/jgil303/yapify/
├── MainActivity.kt
├── MainApplication.kt            -- registers OverlayPackage + AccessibilityPackage
├── ApiKeyStore.kt                -- SharedPreferences helper for API key
├── OverlayService.kt             -- Foreground service: dot, recording, API calls, result card
├── OverlayModule.kt              -- RN bridge: startOverlay, stopOverlay, saveApiKey, hasPermission
├── OverlayPackage.kt             -- registers OverlayModule
├── YapifyAccessibilityService.kt -- tracks focused fields, provides injectText()
├── AccessibilityModule.kt        -- RN bridge: isEnabled, hasActiveField, injectText, openSettings
└── AccessibilityPackage.kt       -- registers AccessibilityModule
```

## Key JS Files
```
app/
├── _layout.tsx      -- bare Stack, headerShown: false
└── index.tsx        -- main screen: FAB, recording, pipeline, toast, settings
components/yapify/
├── FAB.tsx          -- draggable floating button + mode tray
├── Toast.tsx        -- output card with inject/edit/dismiss
├── ToastEditBar.tsx -- voice edit controls within toast
├── Header.tsx       -- logo + settings button
├── InputArea.tsx    -- textarea (ref: injectText method)
├── Settings.tsx     -- API key settings panel
├── StatusPill.tsx   -- status text below FAB
├── ErrorToast.tsx   -- brief error banner
constants/
└── theme.ts         -- colors, fonts
```

## Mode Prompts
- **Default:** Clean up raw transcript into natural prose. Fix grammar/punctuation. Preserve tone exactly. No formatting.
- **Email:** Format as proper email with greeting/sign-off. Minor tonal adjustments only. No added info.
- **Quick Message:** Rewrite as short casual text message. Brief and conversational.
- **AI Prompt:** Execute the instruction directly. Return only the output in user's tone.

## Overlay Dot State Colors
- Teal `#2ec4b6` -- idle (tap to record)
- Red `#ff5a5a` -- recording (tap to stop)
- Gray `#8a9199` -- processing (wait)

## Permissions (AndroidManifest.xml)
```xml
FOREGROUND_SERVICE
FOREGROUND_SERVICE_MICROPHONE
INTERNET
READ_EXTERNAL_STORAGE
RECORD_AUDIO
SYSTEM_ALERT_WINDOW
VIBRATE
WRITE_EXTERNAL_STORAGE
```
Service: `OverlayService` with `foregroundServiceType="microphone"`

## Build Commands
```bash
# Always use this -- fingerprint step fails in Termux
EAS_SKIP_AUTO_FINGERPRINT=1 eas build --platform android --profile development

# Dev server (needed to run dev builds -- app connects to this for JS bundle)
npx expo start --lan

# Check a specific build
eas build:view <build-id>
```

## Build Notes
- EAS fingerprint step always fails in Termux -- always pass `EAS_SKIP_AUTO_FINGERPRINT=1`
- Dev builds require Metro (`npx expo start --lan`) to be running to load the JS bundle
- Tunnel mode (`--tunnel`) fails with ngrok ERR_INVALID_ARG_TYPE -- use `--lan` instead
- `android/` is generated via `npx expo prebuild` -- check if manifest changes persist after prebuild
- `MediaRecorder(Context)` constructor requires API 31 -- use compat pattern:
  ```kotlin
  @Suppress("DEPRECATION")
  val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(ctx) else MediaRecorder()
  ```
- EAS builds fail silently -- check the "Run gradlew" section on expo.dev for the actual Kotlin error

## Debugging
```bash
# Stream overlay service logs
adb connect <ip>:<port>   # wireless ADB via Developer Options > Wireless Debugging
adb logcat -s YapifyOverlay:V ReactNativeJS:V ReactNative:V *:E

# Check build status
eas build:view <build-id>
```
Errors from `OverlayService` surface as Android Toasts (user-visible) and `Log.e(TAG, ...)` (logcat).

## Important Rules
- No em dashes in any code, comments, or copy
- API key is NEVER hardcoded -- always from user settings/SharedPreferences
- Keep code comments concise
- Match the HTML prototype design exactly before adding features
- `s` alone in chat = check `~/yapify/latest-screenshot.png` for visual status

## Screenshot Access
A watcher script copies the latest Android screenshot to `~/yapify/latest-screenshot.png` every 2 seconds. When the user sends just "s", read that file for visual context.

## Roadmap
- **Done:** Full native RN UI, FAB, recording pipeline, toast, mode tray, overlay dot service, accessibility injection
- **In progress:** Standalone overlay recording (dot works without app open) -- EAS build failing
- **Next:** Fix Gradle build error, test full overlay-only flow
- **Planned:** Custom user-defined modes, onboarding, Play Store release, iOS
