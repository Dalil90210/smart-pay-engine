import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.smartpayengine.mobile',
  appName: 'Smart Pay Engine',
  webDir: 'dist',
  server: {
    // Hot-reload from the deployed preview during development.
    // Remove `url` and rebuild to ship a fully offline APK using the bundled dist/.
    url: 'https://be0d8940-8fde-44be-bb23-8b3790a2d9b4.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
};

export default config;
