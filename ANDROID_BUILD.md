# Building the Android APK

Lovable can't produce an APK in-browser — Android builds need the Android SDK + Gradle on your machine. Capacitor is already configured; follow these steps locally.

## One-time setup

1. **Export to GitHub** from Lovable (top-right → GitHub → Connect / Export), then `git clone` the repo locally.
2. Install prerequisites:
   - Node.js 20+ and `bun` (or npm)
   - [Android Studio](https://developer.android.com/studio) (installs the Android SDK + JDK 17)
3. From the project root:
   ```bash
   bun install
   bun run build
   npx cap add android
   npx cap sync android
   ```

## Build a debug APK

```bash
npx cap sync android
cd android
./gradlew assembleDebug
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

## Build a release APK (signed)

1. Generate a keystore once:
   ```bash
   keytool -genkey -v -keystore release.keystore -alias spe -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Configure signing in `android/app/build.gradle` (`signingConfigs { release { ... } }`).
3. Build:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

APK output: `android/app/build/outputs/apk/release/app-release.apk`

## Hot-reload vs offline

`capacitor.config.ts` currently points `server.url` at the Lovable preview URL — the APK loads the live web app, so every code change appears after you re-open the app. For a fully offline/production APK:

1. Remove the `server` block in `capacitor.config.ts`.
2. `bun run build && npx cap sync android`
3. Rebuild the APK.

## After pulling new changes

```bash
git pull
bun install
bun run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

## App icon / launcher icon

The Android launcher icons in `android/app/src/main/res/mipmap-*/` are generated from
`src/assets/icon.png` (1024 × 1024 RGBA PNG), which is the source file for the
`spe-icon.png` branding asset used by the web UI.

If you update `src/assets/icon.png`, regenerate all mipmap PNGs by running:

```bash
pip install Pillow
python3 scripts/generate_android_icons.py
```

> The script (`scripts/generate_android_icons.py`) produces:
> - `ic_launcher.png` — legacy launcher icon (square, white background)
> - `ic_launcher_round.png` — legacy round launcher icon (circular crop)
> - `ic_launcher_foreground.png` — adaptive icon foreground layer (transparent background, icon centred in 108 dp safe zone)
> - `ic_launcher_background.png` — adaptive icon background layer (solid white)
>
> Adaptive icon XML files (`mipmap-anydpi-v26/`) and inset wrappers (`drawable/`) do **not** need regeneration unless the resource names change.
