import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.robeltsefaye.fittrackpro',
  appName: 'FitTrack Pro',
  // `out/` is the static export produced by `npm run build:native` (see
  // scripts/build-native.mjs + next.config.ts's `isNativeBuild` branch) —
  // bundled into the app so it opens instantly offline, no live server
  // round-trip on launch. API routes (Prisma/NextAuth, can't be statically
  // exported) still live only on the Vercel deployment; the bundled UI calls
  // them via absolute URL (src/lib/native/native-auth-token.ts's fetch patch)
  // instead of a `server.url` webview redirect.
  webDir: 'out',
  ios: {
    contentInset: 'automatic',
  },
  // The bundled UI (capacitor://localhost) calls the API on a different
  // origin (the Vercel deployment) — plain fetch()/XHR from a WKWebView is
  // still subject to standard browser CORS, and none of the API routes send
  // CORS headers (they were always same-origin before this phase). Routing
  // through Capacitor's native HTTP bridge instead of the WebView's own
  // networking sidesteps CORS entirely (native URLSession doesn't enforce it)
  // without touching every API route.
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
