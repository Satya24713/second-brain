# Second Brain for Android

The Android app bundles the React interface in a WebView and stores tasks, journal entries, profile and chat history in its local SQLite database. Configure Gemini through Settings. Gemini requests run in the background and stream replies into the chat as they arrive; task capture and completion work locally.

Build with Gradle 8.14.3, JDK 21 and Android SDK 36. `gradle :app:assembleRelease` uses the locally generated, ignored `.android-signing/` key. Back up that folder securely; it is required to sign updates that preserve the installed package. Set `sdk.dir` in ignored `local.properties` for your machine.

The package is `dev.satya.secondbrain`. Install with `adb -s DEVICE_SERIAL install -r app/build/outputs/apk/release/app-release.apk`.

Build the interface with `node node_modules/vite/bin/vite.js build --config vite.spa.config.ts` from the project root before building the APK. The web and Android builds share the same components. Use `adb install -r` to update the installed app while preserving its data.

Internet is required for Gemini. Reminders appear while the app is open; background push notifications are not included. A failed or interrupted reply keeps the user's text available to retry. Chat history is saved as a complete user/assistant pair only after generation succeeds.

Local UI QA: `node tests/ui-preview.mjs` serves the bundled app at `http://127.0.0.1:4173/mobile` with synthetic tasks and a delayed reply stream. It does not use the device database or a Gemini key.
