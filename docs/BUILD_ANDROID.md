# Build Android (APK / AAB)

* Package ID: **`com.smartmanager.loyalty`** (change in `app/capacitor.config.ts` and `app/android/app/build.gradle` before first publication; it can never change afterwards). minSdk 24, target/compile 36.
* No INTERNET permission, `allowBackup=false`, cloud/device-transfer backup excluded.

## Status
The authoring sandbox could not reach the Android SDK host, so **no APK was built locally**. The project is complete and `.github/workflows/android.yml` builds debug + release APK and AAB on GitHub Actions and uploads them as the `smartmanager-loyalty-android` artifact (Actions → latest run → Artifacts). Whether that run succeeded is reported in the final handover; do not assume it.

## Before building: trust your license key
The app only accepts licenses from keys listed in `app/trusted-keys.json`. Create the key in the License Generator, save the public key file, then either `npm run keys:import -w app -- <file>` or set the repository variable `LICENSE_TRUSTED_KEYS`. A build with an empty list can run but nothing can be activated.

## Local build (JDK 21, Android SDK with platform 36)
```bash
npm install
npm run build -w app
cd app && npx cap sync android
cd android && ./gradlew assembleDebug            # app/android/app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease bundleRelease         # release APK + app/android/app/build/outputs/bundle/release/app-release.aab
node ../../scripts/check-no-private-key.mjs app/build/outputs/apk/debug/app-debug.apk
```

## Release signing and updates
Create a keystore once and **keep it forever** (updates must be signed with the same key; Google Play App Signing can hold the upload key):
```bash
keytool -genkeypair -v -keystore release.jks -alias smloyalty -keyalg RSA -keysize 4096 -validity 10000
export SMLOYALTY_KEYSTORE=$PWD/release.jks SMLOYALTY_KEYSTORE_PASSWORD=… SMLOYALTY_KEY_ALIAS=smloyalty SMLOYALTY_KEY_PASSWORD=…
```
In CI set secrets `ANDROID_KEYSTORE_BASE64` (`base64 -w0 release.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Without them the release APK is unsigned (installable only after signing; use the debug APK for quick tests). Increase `versionCode` for every update (`VERSION_CODE` env; CI uses the run number). Installing a newer build over an older one keeps data (same package + signature); the SQLite schema migrates on first launch.

## Test checklist (device/emulator)
Install; activate (share request → issue → import); airplane mode: add customers/purchases, rewards, Smart Actions, reports; create + restore backup; CSV import via file picker; switch to Arabic (RTL); upgrade over previous build keeps data; uninstall/reinstall → new device code (license must be reissued; data is gone unless restored from a backup).
Debug-only and iOS/Android emulation specifics: SQLite is native only on devices/emulators; the browser preview (`npm run dev -w app`) uses sql.js and an insecure browser storage fallback for the device ID.
