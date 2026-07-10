import type { NextConfig } from "next";

// Set only by `npm run build:native` (scripts/build-native.mjs) — produces a
// static export bundled into the Capacitor shell instead of the normal
// Vercel-hosted SSR build. See project-docs/offline-first-roadmap.md Phase 2:
// this is the ONLY thing that differs between the two builds at the config
// level — the app code itself (client-rendered pages, RequireAuth, API
// routes calling resolveUserIdForDataApi for dual cookie/Bearer auth) is
// identical either way. `middleware.ts` is incompatible with `output:
// "export"` (Next.js hard-errors the build if it's present at all — not a
// silent no-op), so build-native.mjs moves it aside for the duration of this
// build and restores it afterward; the normal `npm run build` (Vercel) never
// touches it.
const isNativeBuild = process.env.NATIVE_BUILD === "1";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  // Allow mobile devices on local network during development
  ...(process.env.NODE_ENV === "development" && {
    allowedDevOrigins: ["192.168.2.45"],
  }),
  ...(isNativeBuild && { output: "export" }),
};

export default nextConfig;
