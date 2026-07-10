"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { loadNativeAuthToken } from "@/lib/native/native-auth-token";
import { PRODUCTION_API_ORIGIN } from "@/lib/constants";

/**
 * Patches `window.fetch` once, natively only, so every existing `fetch(...)`
 * call in the app — the ~25 client components that already call `/api/...`
 * routes directly, written before Phase 1's native token existed — keeps
 * working unchanged in the statically-exported native build (see
 * project-docs/offline-first-roadmap.md Phase 2). Two things a relative
 * `fetch("/api/...")` call can no longer do for itself once that build drops
 * Capacitor's `server.url` and has no local server behind it at all:
 *
 * 1. Resolve at all — a relative URL in a `file://`-origin WKWebView doesn't
 *    point anywhere. Rewritten to an absolute URL against
 *    PRODUCTION_API_ORIGIN, the same host the native Swift side already
 *    hardcodes (WatchAPIProxy.swift, CardioPictureInPicturePlugin.swift) —
 *    those API routes keep living only on that Vercel deployment (see
 *    scripts/build-native.mjs for why they aren't bundled into this export).
 * 2. Authenticate — there's no session cookie once there's no server serving
 *    the page. Attaches the stored Bearer token, unless a caller already set
 *    one explicitly (e.g. `authenticatedFetch()`, still fine to use directly
 *    in newly-converted pages — the two never conflict).
 *
 * Both only apply to same-origin-shaped requests (relative, or already
 * pointing at this app's own origin/production host) — a third-party request
 * is never rewritten or given the token.
 */
export function NativeAuthFetchPatch() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if ((window.fetch as { __nativeAuthPatched?: boolean }).__nativeAuthPatched) return;

    const originalFetch = window.fetch.bind(window);

    const patched = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const isRelative = url.startsWith("/");
      const isSameOrigin = isRelative || url.startsWith(window.location.origin) || url.startsWith(PRODUCTION_API_ORIGIN);

      const rewrittenInput = isRelative ? PRODUCTION_API_ORIGIN + url : input;
      const headers = new Headers(init?.headers);

      if (isSameOrigin && !headers.has("Authorization")) {
        const token = await loadNativeAuthToken();
        if (token) headers.set("Authorization", `Bearer ${token}`);
      }

      return originalFetch(rewrittenInput, { ...init, headers });
    };
    patched.__nativeAuthPatched = true;
    window.fetch = patched as typeof window.fetch;
  }, []);

  return null;
}
