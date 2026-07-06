#!/usr/bin/env bash
# build-apk.sh — one-shot Android APK builder for Smart Pay Engine.
#
# Run this on your LOCAL machine (not in Lovable) after cloning the repo.
# Requires: Node 20+, bun (or npm), Android Studio / Android SDK, JDK 17.
#
# Usage:
#   ./build-apk.sh                 # debug APK (default)
#   ./build-apk.sh release         # unsigned release APK
#   OFFLINE=1 ./build-apk.sh       # strip server.url so the APK bundles dist/ instead of loading the live site
#
# Output:
#   debug   → android/app/build/outputs/apk/debug/app-debug.apk
#   release → android/app/build/outputs/apk/release/app-release-unsigned.apk

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

echo "==> Installing dependencies"
$PM install

echo "==> Building web bundle (dist/)"
$PM_RUN build

# --- Offline mode: temporarily strip server.url ------------------------------
CONFIG=capacitor.config.ts
BACKUP=""
if [ "${OFFLINE:-0}" = "1" ]; then
  echo "==> OFFLINE=1 → bundling dist/ (removing server.url)"
  BACKUP="$(mktemp)"
  cp "$CONFIG" "$BACKUP"
  # Delete the whole `server: { ... },` block.
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
  APK="android/app/build/outputs/apk/release/app-release-unsigned.apk"
fi

echo
if [ -f "$APK" ]; then
  echo "✅ APK ready: $APK"
  ls -lh "$APK"
else
  echo "⚠️  Expected APK not found at $APK — check gradle output above." >&2
  exit 1
fi
