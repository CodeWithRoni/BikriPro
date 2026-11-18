# Packaging BikriPro for every platform

| Platform | Output | Tool | Where |
|---|---|---|---|
| Windows | `BikriPro-Setup-x.y.z.exe` (NSIS installer) | Electron + electron-builder | `desktop/` |
| macOS | `BikriPro-x.y.z-{x64,arm64}.dmg` | Electron + electron-builder | `desktop/` |
| Linux | `bikripro_x.y.z_amd64.deb` | Electron + electron-builder | `desktop/` |
| Android | `.apk` / `.aab` | Capacitor 6 + Gradle | `frontend/android/` |
| iOS / iPadOS | `.ipa` | Capacitor 6 + Xcode | `frontend/ios/` |

All icons come from `branding/` and are already wired in:
`desktop/build/icon.ico` (Windows), `desktop/build/icon.png` (1024 px, converted to `.icns` for macOS), `desktop/build/icons/*.png` (Linux), Android `mipmap-*` launcher icons + splash screens, iOS `AppIcon` (1024 px, no alpha) + splash.

## Automatic builds (recommended)

GitHub → **Actions → Build installers → Run workflow**. After ~15 minutes download the artifacts.
Pushing a tag (`v1.0.0`) also creates a GitHub Release with every file attached.
Each installer must be built on its own OS, which the workflow handles (Windows, macOS and Ubuntu runners).

## Desktop (Electron)

```bash
cd desktop
npm install
npm run dist:win     # on Windows  → desktop/release/BikriPro-Setup-1.0.0.exe
npm run dist:mac     # on macOS    → desktop/release/BikriPro-1.0.0-arm64.dmg (+ x64)
npm run dist:linux   # on Linux    → desktop/release/bikripro_1.0.0_amd64.deb
npm start            # run the desktop app without packaging
```

`npm run prepare-app` (run automatically) builds the React app into `desktop/web` and copies the API with production dependencies into `desktop/server`. Both are shipped as `extraResources`:

- `web/` — the UI, loaded from disk (works offline).
- `server/` — the embedded API. It starts in the background when `EMBEDDED_SERVER=1` in `<userData>/server.env` (File → Server settings). Set it to `0` on tills that connect to another PC.

**Code signing** (optional, removes “unknown publisher” warnings):
Windows — set `CSC_LINK` (p12/pfx, base64) and `CSC_KEY_PASSWORD` secrets.
macOS — set `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` and add `"notarize": true` under `build.mac`.
Then remove `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` from the workflow.

## Android (Capacitor)

Requirements: Android Studio (JDK 17, Android SDK 34).

```bash
cd frontend
npm install
npm run build && npx cap sync android
npx cap open android          # Android Studio → Build → Build APK(s)
# or on the command line:
cd android && ./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
```

Release APK/AAB for Play Store: Android Studio → Build → Generate Signed Bundle / APK, create a keystore once and keep it safe.
The app uses plain `http://` to reach the shop server on the LAN, so `usesCleartextTraffic` is enabled and Capacitor's `androidScheme` is `http`.

## iOS / iPadOS (Capacitor)

Requirements: a Mac with Xcode 15+, CocoaPods, and an Apple Developer account for installing on devices.

```bash
cd frontend
npm install
npm run build && npx cap sync ios
npx cap open ios              # Xcode → select your Team in Signing & Capabilities
```

Xcode → Product → Archive → Distribute App (Ad Hoc / App Store / TestFlight) produces the signed `.ipa`.
The CI workflow builds an **unsigned** IPA for verification only; it must be re-signed before it can be installed.
`Info.plist` already allows local-network HTTP (`NSAllowsArbitraryLoads`, `NSAllowsLocalNetworking`) and has camera/photo usage texts for product photos.

## Changing the version

Update `version` in `desktop/package.json` (desktop installers), `frontend/android/app/build.gradle` (`versionCode`, `versionName`) and the iOS target's Version/Build in Xcode.
