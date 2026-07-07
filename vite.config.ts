// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// MOBILE_BUILD=1 produces a static SPA (prerendered index.html) for the Capacitor APK.
// Unset (the default) keeps the intentional SSR + Nitro/Cloudflare build used for web deploys.
const isMobileBuild = process.env.MOBILE_BUILD === "1";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    // Mobile only: prerender a static SPA shell so the APK can bundle assets offline.
    // Emit the shell as index.html (default is _shell.html) so Capacitor's webDir has an entry point.
    ...(isMobileBuild ? { spa: { enabled: true, prerender: { outputPath: "/index.html" } } } : {}),
  },
  // Mobile only: disable the Nitro/Cloudflare deploy plugin. SPA mode must own the build —
  // its prerender preview-server expects the server at dist/server/server.js, which the
  // Nitro plugin does not produce. Web/SSR deploys leave this untouched.
  ...(isMobileBuild ? { nitro: false } : {}),
});
