# Second Brain for Android

This Android package uses Google's Android Browser Helper and the same private online app/backend. It keeps authentication in the device's browser, shares its signed-in session, and avoids injecting a native JavaScript bridge or embedding credentials. Gemini is configured through the app's Settings.

Build with Gradle 8.14.3, JDK 21 and Android SDK 36. `gradle :app:assembleRelease` uses the locally generated, ignored `.android-signing/` key. Back up that folder securely; it is required to sign updates that preserve the installed package. Set `sdk.dir` in ignored `local.properties` for your machine.

The package is `dev.satya.secondbrain`. Install with `adb -s DEVICE_SERIAL install -r app/build/outputs/apk/release/app-release.apk`.

The app needs internet. Reminders appear while the workspace is open; this build does not provide background push notifications. Browser Helper requests trusted fullscreen presentation. If the private site's access gate prevents public verification of `.well-known/assetlinks.json`, the browser displays its security toolbar. This expected fallback preserves secure sign-in and does not make the site public.
