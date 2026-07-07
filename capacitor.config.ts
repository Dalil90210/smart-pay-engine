import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.smartpayengine.mobile',
  appName: 'Smart Pay Engine',
  // The mobile build (MOBILE_BUILD=1 vite build) outputs a static SPA with a prerendered
  // index.html shell to dist/client. The default SSR build (.output/public) has no index.html
  // and is not used for the APK.
  webDir: 'dist/client',
  // server.url (Lovable preview hot-reload) intentionally removed so the APK
  // bundles the web assets offline instead of loading a live URL.
};

export default config;
