// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    // Build a static SPA shell (prerendered index.html) so the Capacitor APK can bundle the
    // web assets offline. Note: with SPA mode the server bundle is not shipped in the APK —
    // any server functions / SSR must be reached over the network from a deployed backend.
    spa: {
      enabled: true,
    },
  },
  // Emit a static site (index.html + client assets) into .output/public instead of a
  // Cloudflare server bundle, which is what capacitor.config.ts (webDir) expects.
  nitro: {
    preset: "static",
  },
});
