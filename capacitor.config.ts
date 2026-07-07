import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.smartpayengine.mobile',
  appName: 'Smart Pay Engine',
  // The Vite/TanStack Start build outputs static assets to .output/public, not dist/.
  webDir: '.output/public',
  // server.url (Lovable preview hot-reload) intentionally removed so the APK
  // bundles the web assets offline instead of loading a live URL.
};

export default config;
