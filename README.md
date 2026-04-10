# Yapi

Android voice-to-text with AI post-processing and a floating overlay workflow.

## Current State
- React Native app is working.
- Android overlay dot is working.
- Latest pushed commits:
  - `55d309d` Use mic icon for FAB processing and overlay
  - `f65ea59` Fix overlay minimize, injection flow, and settings polish
  - `acd8573` Fix: don't apply global prompt to edit pipeline

## Main Commands
```bash
npx expo start --lan
npx eas-cli@latest build --platform android --profile development
```

## Restart Notes
- Confirm with the user before sending or committing new implementation work.
- Keep the current working app preserved before the next planned feature batch.
- The next planned work includes a dev/prod split, Yapi branding rename, cursor-accurate insertion, context-aware visibility, and card action redesign.

## Main References
- [`Yapify Project.md`](/C:/Development/Yapify/yapify/Yapify Project.md)
- [`app/index.tsx`](/C:/Development/Yapify/yapify/app/index.tsx)
- [`components/yapify/FAB.tsx`](/C:/Development/Yapify/yapify/components/yapify/FAB.tsx)
- [`components/yapify/Settings.tsx`](/C:/Development/Yapify/yapify/components/yapify/Settings.tsx)
- [`android/app/src/main/java/com/jgil303/yapify/OverlayService.kt`](/C:/Development/Yapify/yapify/android/app/src/main/java/com/jgil303/yapify/OverlayService.kt)
