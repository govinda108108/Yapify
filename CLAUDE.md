# Yapify — Project Brief for Claude Code

## What is Yapify?
Yapify is a voice-to-text app with AI processing. It lets users record their voice, transcribes it via Whisper, then processes it through an LLM to clean, reformat, or transform the text based on a selected mode. The output appears in a toast, which can then be injected into a text field, dismissed, or voice-edited.

## Current State
A fully working HTML prototype exists at `assets/yapify-full.html`. This is the source of truth for UI design, interaction patterns, and pipeline logic. All new React Native code should match this reference as closely as possible.

## Tech Stack
- **Framework:** React Native with Expo (EAS Build for native features)
- **Build:** EAS Build (cloud compilation — dev builds, not Expo Go)
- **AI Pipeline:** Groq API — Whisper large-v3-turbo for transcription, LLaMA 3.3 70b for text processing
- **Target:** Android only (for now)
- **Key native feature:** System overlay (floating dot over other apps)

## Design System
All colours and fonts from the HTML prototype:
```
--bg: #0e1012
--surface: #1a1d1f
--surface2: #22262a
--border: #2c3035
--text: #eceef0
--muted: #8a9199
--teal: #2ec4b6
--teal2: #1a9e94
--red: #ff5a5a
Font: DM Sans (body), DM Mono (labels/mono)
```

## Core UI Elements
1. **Header** — Yapify logo (teal concentric circles SVG) + "Yapify" wordmark
2. **Textarea** — Dark surface, placeholder "Tap to type, or use the dot to dictate..."
3. **Floating dot FAB** — Small teal dot, draggable, lives in top half of screen
   - Tap → expands to big button
   - Tap big button → records audio
   - Hold big button → mode tray appears (drag to select mode)
   - Tap again while recording → stops, processes
4. **Mode tray** — 4 modes selectable by hold+drag on the FAB:
   - 🎙️ Default — clean transcript
   - ✉️ Email — format as email
   - 💬 Quick Message — short casual text
   - 🤖 AI Prompt — execute instruction directly
5. **Toast output** — appears after processing with:
   - Drag handle (long press to reposition — important for keyboard avoidance)
   - Output text
   - Three buttons: Inject ↓ | ✏️ Edit | Dismiss
6. **Voice Edit** — tapping Edit in the toast starts a new recording; the spoken instruction + current output text are sent back to the LLM to produce an updated version
7. **Settings panel** — slides in from right, contains API key input (Groq gsk_ or OpenAI sk-)

## AI Pipeline
```
Record audio → Blob → Groq Whisper transcription → transcript text
→ Groq LLaMA 3.3 70b with mode-specific system prompt → output text
→ Show in toast
```
Mock mode: if no valid API key, returns hardcoded demo text (for UI testing).

Edit pipeline:
```
Record edit instruction → transcribe → send {current output + edit instruction} to LLaMA → update toast
```

## Mode Prompts
- **Default:** Clean up raw transcript into natural prose. Fix grammar/punctuation. Preserve tone and meaning exactly. No formatting.
- **Email:** Format as proper email with greeting and sign-off. Minor tonal adjustments only.
- **Quick Message:** Rewrite as short casual text message. Keep brief and conversational.
- **AI Prompt:** Execute the instruction directly. Write in user's tone. Return only the output.

## Native Android Features Needed
### 1. System Overlay Service
- Permission: `SYSTEM_ALERT_WINDOW`
- The floating teal dot should appear over ALL other apps
- Tapping it opens Yapify or starts recording depending on state
- Implementation: Native Kotlin `Service` with `WindowManager` overlay
- Bridge to React Native via **Method Channel**

### 2. Accessibility Service (future)
- Allow Yapify dot to appear in accessibility shortcut menu
- Long-term goal: inject text directly into any focused text field system-wide

## App Permissions Required (app.json / AndroidManifest)
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.INTERNET" />
```

## Build Setup
- EAS Build configured for Android
- Dev build (not Expo Go) required for native modules
- Run builds with: `eas build --platform android --profile development`
- Install APK directly on device after build completes

## Key Packages
```
react-native-webview      — for WebView wrapper phase
expo-av                   — audio recording
expo-file-system          — file handling
```

## Development Approach
**Phase 1 — WebView wrapper (DONE)**
`app/index.tsx` wraps `assets/yapify-v0.1.html` in a full-screen WebView. APK built via EAS (build ID: 3a1d1720). Permissions, package name, and EAS APK build type all configured.

**Phase 2 — Native overlay (IN PROGRESS)**
Kotlin overlay service written. Floating teal dot appears system-wide via `WindowManager`. Tapping it opens Yapify. Draggable. Method Channel bridge (`OverlayModule`) lets React Native start/stop the service and check/request `SYSTEM_ALERT_WINDOW` permission.

Key files:
- `android/app/src/main/java/com/jgil303/yapify/OverlayService.kt`
- `android/app/src/main/java/com/jgil303/yapify/OverlayModule.kt`
- `android/app/src/main/java/com/jgil303/yapify/OverlayPackage.kt`

Next: add JS-side hook in `app/index.tsx` to call `OverlayModule.startOverlay()` on app launch (after permission check). Then build and test.

**Phase 3 — Full native UI**
Rebuild the Yapify UI natively in React Native (matching the HTML prototype exactly). Replace WebView with native components.

**Phase 4 — Accessibility service**
Register as Android accessibility service. Enable text injection into any app's text field.

## Developer Context
- Built and iterated on Termux (Android phone) + Claude Code
- EAS Build handles cloud compilation — no local Android SDK needed
- GitHub repo connected to EAS
- API key stored in app settings (not hardcoded), persisted in AsyncStorage
- Developer has Android background, is learning automation/RN
- Voice input to Claude Code: use SwiftKey mic to dictate prompts as text

## File Structure
```
yapify/
├── CLAUDE.md                     ← this file
├── app.json                      ← Expo config + permissions
├── eas.json                      ← EAS build profiles (APK for dev/preview)
├── assets/
│   ├── yapify-v0.1.html          ← Active WebView source (loaded by app/index.tsx)
│   └── yapify-full.html          ← HTML prototype (source of truth for UI design)
├── app/
│   ├── _layout.tsx               ← Bare Stack, headerShown: false
│   └── index.tsx                 ← Full-screen WebView screen
├── components/                   ← Reusable RN components (boilerplate, unused in Phase 1)
└── android/                      ← Native Android code (generated via expo prebuild)
    └── app/src/main/
        ├── AndroidManifest.xml   ← Permissions + OverlayService declaration
        └── java/com/jgil303/yapify/
            ├── MainActivity.kt
            ├── MainApplication.kt ← Registers OverlayPackage
            ├── OverlayService.kt  ← Floating dot via WindowManager
            ├── OverlayModule.kt   ← RN Method Channel bridge
            └── OverlayPackage.kt  ← Registers OverlayModule
```

## Roadmap

**Phase 1 - WebView wrapper (DONE)**
Wrap HTML prototype in native APK via EAS. Mic and API calls work through WebView. Installable on Android.
- Native mic recording via expo-av (bypasses WebView sandbox block)
- FAB draggable in all states: expanded, recording, mode tray
- Keyboard-aware FAB: jumps to top half when keyboard opens, free movement otherwise
- No-audio-detected error on empty recordings
- No-API-key error shown instead of mock output

**Phase 2 - Android overlay (IN PROGRESS)**
Kotlin service draws floating dot over all other apps system-wide. Method channel bridges Kotlin to React Native JS.
- Kotlin OverlayService, OverlayModule, OverlayPackage all written
- Next: wire up JS-side hook in app/index.tsx to call OverlayModule.startOverlay() on launch after permission check

**Phase 3 - Native UI**
Rebuild Yapify screen natively in React Native. Replace WebView. Match HTML design exactly.

**Phase 4 - Accessibility service**
Register as Android accessibility service. Inject processed text directly into any app's focused text field.

**Phase 5 - Polish and settings**
API key persistence via AsyncStorage. Onboarding flow. Error handling. Settings screen improvements.

**Phase 6 - Custom modes**
User-defined modes with custom prompts. Save and name your own modes. Reply-to-text mode.

**Phase 7 - Monetisation**
Bring-your-own-key model free tier. Hosted subscription at ~$5/month covering API costs.

**Phase 8 - Play store**
Production EAS build. Store listing. Privacy policy. Public launch.

**Phase 9 - iOS**
Full Yapify experience on iPhone minus system overlay. PWA fallback for overlay functionality.

**Phase 10 - Long term**
Desktop app via Electron or Tauri. Team and workspace features. Deep integrations with WhatsApp, Gmail, Slack.

## Build Notes
- EAS fingerprint step fails in Termux -- always build with:
  `EAS_SKIP_AUTO_FINGERPRINT=1 eas build --platform android --profile development`
- android/ is generated via `npx expo prebuild --platform android --clean` -- do not manually edit files that prebuild overwrites (check build logs if manifest changes disappear)

## Important Notes
- **No em dashes** in any copy or comments
- Keep code comments concise and clear
- Match the HTML prototype's interaction model exactly before adding new features
- The FAB dot can be dragged anywhere on screen; it auto-jumps to the top half when the keyboard opens
- Toast must use visualViewport to position above keyboard
- API key is never hardcoded -- always from user settings

## Screenshot access
A watcher script runs automatically on startup that copies the latest Android screenshot to ~/yapify/latest-screenshot.png every 2 seconds. When the user sends just the letter "s" alone, or says "check screenshot", "look at screenshot", or similar, read ~/yapify/latest-screenshot.png for visual context.
