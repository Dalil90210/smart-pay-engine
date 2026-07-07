# Building the Android APK

Lovable can't produce an APK in-browser — Android builds need the Android SDK + Gradle on your
machine. Capacitor is already configured; follow these steps locally.

> **Note on CI / sandbox failures:** Previous attempts to build the APK in the Lovable cloud
> sandbox or automated CI environments failed due to **network restrictions** (Maven Central /
> Google dependency downloads are blocked). This is an environment limitation, not a code issue.
> The build works correctly on a standard developer machine with internet access.

---

## Prerequisites

Install these once before your first build:

| Tool | Minimum version | How to install |
|------|----------------|----------------|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) or [nvm](https://github.com/nvm-sh/nvm) |
| bun *(optional)* | latest | `npm install -g bun` or [bun.sh](https://bun.sh) |
| Android Studio | Hedgehog+ | [developer.android.com/studio](https://developer.android.com/studio) |
| JDK 17 | 17 | Bundled with Android Studio — no separate install needed |

After installing Android Studio, open it once and let it download the default **Android SDK**
(API 35 or the recommended level). The SDK is placed at:

- **macOS:** `~/Library/Android/sdk`
- **Linux:** `~/Android/Sdk`
- **Windows:** `%LOCALAPPDATA%\Android\Sdk`

Set `ANDROID_HOME` in your shell profile (`.zshrc` / `.bashrc` / PowerShell profile):

```bash
# macOS / Linux
export ANDROID_HOME=$HOME/Library/Android/sdk        # macOS
# export ANDROID_HOME=$HOME/Android/Sdk              # Linux
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

---

## One-time project setup

After cloning the repo for the first time:

```bash
# 1. Install JS dependencies
npm install          # or: bun install

# 2. Build the web bundle in mobile mode
MOBILE_BUILD=1 npm run build   # macOS/Linux
# Windows PowerShell:
# $env:MOBILE_BUILD=1; npm run build

# 3. Add the Android platform (only needed once)
npx cap add android

# 4. Sync Capacitor assets
npx cap sync android
```

---

## Build a debug APK (recommended for testing)

Use the helper script for the full automated flow:

```bash
./build-apk.sh          # builds a debug APK
```

Or manually:

```bash
MOBILE_BUILD=1 npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

Install on a connected device or emulator:

```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Build a release APK (signed, for distribution)

1. Generate a keystore **once** (keep it safe — back it up securely):
   ```bash
   keytool -genkey -v -keystore ~/spe-release.keystore \
           -alias spe -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Build using the helper script (it will prompt for keystore details):
   ```bash
   ./build-apk.sh release
   ```

   Or supply details via environment variables (useful for CI):
   ```bash
   KEYSTORE_PATH=~/spe-release.keystore \
   KEY_ALIAS=spe \
   KEYSTORE_PASSWORD=yourpassword \
   ./build-apk.sh release
   ```

APK output: `android/app/build/outputs/apk/release/app-release.apk`

---

## Offline / self-contained APK

By default `capacitor.config.ts` points `server.url` at the Lovable preview URL — the app loads
the live web build over the network. For a fully offline / production APK that bundles the web
assets:

```bash
OFFLINE=1 ./build-apk.sh       # strips server.url automatically
```

Or manually:
1. Remove the `server` block in `capacitor.config.ts`.
2. `MOBILE_BUILD=1 npm run build && npx cap sync android`
3. Rebuild the APK.

---

## After pulling new code changes

```bash
git pull
npm install
MOBILE_BUILD=1 npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `ANDROID_HOME is not set` | Set `ANDROID_HOME` as shown in Prerequisites above |
| `Java not found` | Install JDK 17 via Android Studio SDK Tools or [Adoptium](https://adoptium.net) |
| `Node.js 20+ required` | Upgrade Node: `nvm install 20 && nvm use 20` |
| Gradle download hangs / times out | You're on a restricted network. Run on a machine with unrestricted Maven/Google access |
| `cap sync` fails with "Android platform not installed" | Run `npx cap add android` first |
| White screen on device | Check that `MOBILE_BUILD=1` was set during `npm run build`, then re-sync |
