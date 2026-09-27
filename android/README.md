# Second Brain for Android

The Android app bundles the React interface in a WebView and stores tasks, journal entries, profile, chat history, configurable trackers, measurement entries and markdown memories in its local SQLite database. Version 1.2.0 (version code 5) adds the Tracker screen, completed tasks in Today, past-date browsing in Upcoming, relative task dates and chat access from the floating button. Configure Gemini through Settings. Gemini requests run in the background and stream replies into chat; task capture, tracking and memory editing work locally.

Memory documents can be created and edited in Settings, imported from markdown and exported through Android's file picker. They live in SQLite until exported. The assistant receives document metadata and can recall contents or use memories attached with the chat + button. It can propose creating, changing and deleting tasks, journal entries, trackers, measurements and memory documents; the user applies proposals before data changes. Chat requests include send time and timezone, and `/t` shows local date/time.

Build with Gradle 8.14.3, JDK 21 and Android SDK 36. `gradle :app:assembleRelease` uses the locally generated, ignored `.android-signing/` key. Back up that folder securely; it is required to sign updates that preserve the installed package. Set `sdk.dir` in ignored `local.properties` for your machine.

The package is `dev.satya.secondbrain`. Install with `adb -s DEVICE_SERIAL install -r app/build/outputs/apk/release/app-release.apk`.

Build the interface with `node node_modules/vite/bin/vite.js build --config vite.spa.config.ts` from the project root before building the APK. The web and Android builds share the same components. Use `adb install -r` to update the installed app while preserving its data.

Internet is required for Gemini. Reminders appear while the app is open; background push notifications are not included. A failed or interrupted reply keeps the user's text available to retry. Chat history is saved as a complete user/assistant pair only after generation succeeds.

Local UI QA: `node tests/ui-preview.mjs` serves the bundled app at `http://127.0.0.1:4173/mobile` with synthetic tasks and a delayed reply stream. It does not use the device database or a Gemini key.

Version 1.2 verification: the tracking and task-view unit tests cover aggregations, comparisons, date visibility and relative labels. Eight Android integration tests in `UpgradeTest` passed on the connected device, covering preservation of existing tasks during migration, tracker/entry CRUD, time intervals, yes/no validation, memory CRUD and metadata, timestamp normalization, proposal updates/deletions and single application, transaction rollback, and invalid values. Run them with `gradle :app:connectedDebugAndroidTest` from this directory. Live Gemini network responses were not tested for this update.
