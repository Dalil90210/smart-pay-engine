#!/usr/bin/env bash
# build-apk.sh — one-shot Android APK builder for Smart Pay Engine.
#
# Run this on your LOCAL machine (not in Lovable) after cloning the repo.
# Requires: Node 20+, bun (or npm), Android Studio / Android SDK, JDK 17.
#
# Usage:
#   ./build-apk.sh                 # debug APK (default)
#   ./build-apk.sh release         # SIGNED release APK (see signing below)
#   OFFLINE=1 ./build-apk.sh       # strip server.url so the APK bundles dist/
#
# --- Release signing ---------------------------------------------------------
# For `release`, the script needs a keystore. Provide it via env vars OR let
# the script prompt you interactively:
#
#   KEYSTORE_PATH       absolute path to your .keystore / .jks file
#   KEYSTORE_PASSWORD   store password
#   KEY_ALIAS           key alias inside the keystore
#   KEY_PASSWORD        key password (defaults to KEYSTORE_PASSWORD if unset)
#
# Create a keystore once (keep it safe, back it up):
#   keytool -genkey -v -keystore ~/spe-release.keystore \
#           -alias spe -keyalg RSA -keysize 2048 -validity 10000
#
# Output:
#   debug   → android/app/build/outputs/apk/debug/app-debug.apk
#   release → android/app/build/outputs/apk/release/app-release.apk  (signed)

set -euo pipefail

BUILD_TYPE="${1:-debug}"
case "$BUILD_TYPE" in
  debug)   GRADLE_TASK="assembleDebug" ;;
  release) GRADLE_TASK="assembleRelease" ;;
  *) echo "Unknown build type: $BUILD_TYPE (use 'debug' or 'release')" >&2; exit 1 ;;
esac

# --- Preflight ---------------------------------------------------------------
command -v node >/dev/null || { echo "node not found — install Node.js 20+"; exit 1; }
if command -v bun >/dev/null; then PM=bun; PM_RUN="bun run"; PM_X="bunx";
elif command -v npm >/dev/null; then PM=npm; PM_RUN="npm run"; PM_X="npx";
else echo "Need bun or npm"; exit 1; fi

if [ -z "${ANDROID_HOME:-}${ANDROID_SDK_ROOT:-}" ]; then
  echo "WARN: ANDROID_HOME / ANDROID_SDK_ROOT is not set. Gradle may fail to locate the SDK." >&2
fi

# --- Collect signing config (release only) -----------------------------------
prompt_if_empty() {
  local var="$1" msg="$2" silent="${3:-0}"
  if [ -z "${!var:-}" ]; then
    if [ ! -t 0 ]; then
      echo "ERROR: $var not set and no TTY to prompt on." >&2; exit 1
    fi
    if [ "$silent" = "1" ]; then
      read -rsp "$msg: " val; echo
    else
      read -rp "$msg: " val
    fi
    printf -v "$var" '%s' "$val"
    export "$var"
  fi
}

if [ "$BUILD_TYPE" = "release" ]; then
  prompt_if_empty KEYSTORE_PATH     "Keystore file path"
  KEYSTORE_PATH="${KEYSTORE_PATH/#\~/$HOME}"
  [ -f "$KEYSTORE_PATH" ] || { echo "Keystore not found: $KEYSTORE_PATH" >&2; exit 1; }
  # Normalize to absolute path.
  KEYSTORE_PATH="$(cd "$(dirname "$KEYSTORE_PATH")" && pwd)/$(basename "$KEYSTORE_PATH")"
  export KEYSTORE_PATH

  prompt_if_empty KEY_ALIAS         "Key alias"
  prompt_if_empty KEYSTORE_PASSWORD "Keystore password" 1
  : "${KEY_PASSWORD:=$KEYSTORE_PASSWORD}"; export KEY_PASSWORD
fi

echo "==> Installing dependencies"
$PM install

echo "==> Building web bundle (dist/)"
MOBILE_BUILD=1 $PM_RUN build

# --- Offline mode: temporarily strip server.url ------------------------------
CONFIG=capacitor.config.ts
BACKUP=""
if [ "${OFFLINE:-0}" = "1" ]; then
  echo "==> OFFLINE=1 → bundling dist/ (removing server.url)"
  BACKUP="$(mktemp)"
  cp "$CONFIG" "$BACKUP"
  node -e "
    const fs=require('fs');
    let s=fs.readFileSync('$CONFIG','utf8');
    s=s.replace(/\s*server:\s*{[^}]*},?/,'');
    fs.writeFileSync('$CONFIG',s);
  "
  restore_config() { [ -n "$BACKUP" ] && cp "$BACKUP" "$CONFIG" && rm -f "$BACKUP"; }
  trap restore_config EXIT
fi

# --- Add android platform if missing -----------------------------------------
if [ ! -d android ]; then
  echo "==> Adding Android platform"
  $PM_X cap add android
fi

echo "==> Syncing Capacitor → android/"
$PM_X cap sync android

# --- Patch android/app/build.gradle with a release signingConfig -------------
# Idempotent: we tag the injected block with a sentinel comment and skip if present.
GRADLE_FILE="android/app/build.gradle"
SENTINEL="// lovable-signing-config"
if [ "$BUILD_TYPE" = "release" ] && ! grep -q "$SENTINEL" "$GRADLE_FILE"; then
  echo "==> Injecting release signingConfig into $GRADLE_FILE"
  node -e "
    const fs=require('fs');
    const p='$GRADLE_FILE';
    let s=fs.readFileSync(p,'utf8');
    const block = \`
    $SENTINEL
    signingConfigs {
        release {
            def ksPath = System.getenv('KEYSTORE_PATH')
            if (ksPath) {
                storeFile file(ksPath)
                storePassword System.getenv('KEYSTORE_PASSWORD')
                keyAlias System.getenv('KEY_ALIAS')
                keyPassword System.getenv('KEY_PASSWORD') ?: System.getenv('KEYSTORE_PASSWORD')
            }
        }
    }
\`;
    // Insert signingConfigs right after 'android {'
    s = s.replace(/android\s*\{\s*\n/, m => m + block);
    // Wire buildTypes.release to use it (add signingConfig line if missing).
    s = s.replace(/buildTypes\s*\{\s*\n\s*release\s*\{\s*\n/, m => m + '            signingConfig signingConfigs.release\n');
    fs.writeFileSync(p, s);
  "
fi

# --- Gradle build ------------------------------------------------------------
echo "==> Running ./gradlew $GRADLE_TASK"
cd android
chmod +x ./gradlew
./gradlew "$GRADLE_TASK"
cd ..

# --- Report ------------------------------------------------------------------
if [ "$BUILD_TYPE" = "debug" ]; then
  APK="android/app/build/outputs/apk/debug/app-debug.apk"
else
  APK="android/app/build/outputs/apk/release/app-release.apk"
fi

echo
if [ -f "$APK" ]; then
  echo "✅ APK ready: $APK"
  ls -lh "$APK"
  if [ "$BUILD_TYPE" = "release" ] && command -v "${ANDROID_HOME:-$ANDROID_SDK_ROOT}/build-tools"/*/apksigner >/dev/null 2>&1; then
    APKSIGNER=$(ls "${ANDROID_HOME:-$ANDROID_SDK_ROOT}"/build-tools/*/apksigner 2>/dev/null | tail -n1)
    [ -n "$APKSIGNER" ] && "$APKSIGNER" verify --print-certs "$APK" >/dev/null && echo "✅ Signature verified"
  fi
else
  echo "⚠️  Expected APK not found at $APK — check gradle output above." >&2
  exit 1
fi
