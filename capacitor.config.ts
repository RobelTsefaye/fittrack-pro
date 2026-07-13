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
    // Capacitor's debug bridge logs plugin responses verbatim. Native auth
    // tokens travel through that bridge from the Keychain to JS, so keeping
    // logging enabled would expose them in Xcode/Console output.
    loggingBehavior: 'none',
  },
  // Deliberately NOT enabling `plugins.CapacitorHttp` here — that flag makes
  // Capacitor patch `window.fetch`/`XMLHttpRequest` globally, which also
  // rewrites Next.js's OWN internal same-origin fetches (the RSC-payload
  // `.txt` files under capacitor://localhost that its client router uses for
  // fast in-app navigation). Routed through the native bridge, those broke in
  // a way that made the router fall back to a full hard reload on every
  // single navigation — the entire app (biometric lock, HealthKit sync, push
  // registration, native re-login) re-ran on every tab tap. Cross-origin API
  // calls (the Vercel deployment) still need to bypass WKWebView's CORS
  // enforcement — that's done narrowly instead, via the `CapacitorHttp`
  // plugin's `request()` JS API called directly and only for those requests,
  // in native-auth-fetch-patch.tsx. Same-origin requests keep using the
  // completely unmodified `fetch`.
};

export default config;
