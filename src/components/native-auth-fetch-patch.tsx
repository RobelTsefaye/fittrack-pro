"use client";

import { useEffect } from "react";
import { Capacitor, CapacitorHttp, CapacitorCookies } from "@capacitor/core";
import { getCachedToken, clearCachedToken } from "@/lib/native/auth-token-cache";
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
 * 1. Resolve at all — a relative URL under `capacitor://localhost` doesn't
 *    point at the API. Rewritten to an absolute URL against
 *    PRODUCTION_API_ORIGIN, the same host the native Swift side already
 *    hardcodes (WatchAPIProxy.swift, CardioPictureInPicturePlugin.swift) —
 *    those API routes keep living only on that Vercel deployment (see
 *    scripts/build-native.mjs for why they aren't bundled into this export).
 * 2. Authenticate, and get past WKWebView's CORS enforcement — there's no
 *    session cookie once there's no server serving the page, and a plain
 *    cross-origin `fetch`/XHR from the WebView is blocked by standard
 *    browser CORS same as in any browser (none of the API routes send CORS
 *    headers; they never needed to before this phase). Routed through the
 *    `CapacitorHttp` plugin's native `request()` API instead of the WebView's
 *    own networking, neither problem applies (native URLSession doesn't
 *    enforce CORS) — and the Bearer token is attached alongside it.
 *
 * ONLY requests shaped like an API call (relative `/api/...`, or already
 * pointing at PRODUCTION_API_ORIGIN) are touched at all. Everything else —
 * critically, Next.js's own same-origin fetches for its client-side router
 * (the RSC-payload `.txt` files under capacitor://localhost that make tab
 * navigation fast without a full reload) — passes straight through to the
 * real `fetch`, untouched. Capacitor's blanket `plugins.CapacitorHttp.enabled`
 * config flag was tried first and rewrote ALL fetches indiscriminately,
 * including those — the router couldn't handle the rebridged response and
 * fell back to a hard `window.location` navigation on every single tab tap,
 * re-running the entire app's startup sequence (biometric lock, HealthKit
 * sync, push registration, native re-login) each time. That flag is
 * deliberately left unset in capacitor.config.ts; this component calls
 * `CapacitorHttp.request()` directly, and only for the requests that need it.
 */
export function NativeAuthFetchPatch() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if ((window.fetch as { __nativeAuthPatched?: boolean }).__nativeAuthPatched) return;

    const originalFetch = window.fetch.bind(window);

    // iOS keeps WKWebView's cookie jar and the native URLSession store
    // `CapacitorHttp.request()` uses separate from each other — a raw
    // `request()` call neither reads existing cookies nor writes back
    // `Set-Cookie` from the response, so NextAuth's CSRF double-submit cookie
    // (set by the GET /api/auth/csrf call) never reached the following POST
    // /api/auth/callback/credentials, which then failed with `MissingCSRF`
    // (surfaced in the login form as a misleading "invalid email or
    // password"). Capacitor's own official fetch-patch (the
    // `plugins.CapacitorHttp.enabled` config flag, not used here — see this
    // file's top comment) bridges the two stores via the companion
    // `CapacitorCookies` plugin around every request; these two helpers
    // replicate exactly that, scoped to just the requests this patch handles.
    async function attachStoredCookies(url: string, headers: Headers): Promise<void> {
      const cookies = await CapacitorCookies.getCookies({ url });
      const cookieHeader = Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");
      if (cookieHeader) headers.set("Cookie", cookieHeader);
    }

    async function storeResponseCookies(url: string, headers: Record<string, string>): Promise<void> {
      const setCookie = headers["set-cookie"] ?? headers["Set-Cookie"];
      if (!setCookie) return;
      const [pair] = setCookie.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) return;
      await CapacitorCookies.setCookie({
        url,
        key: pair.slice(0, eq).trim(),
        value: pair.slice(eq + 1).trim(),
      });
    }

    async function requestViaNativeBridge(url: string, init: RequestInit | undefined, headers: Headers, needsCookies: boolean): Promise<Response> {
      if (needsCookies) await attachStoredCookies(url, headers);

      const headersObj: Record<string, string> = {};
      headers.forEach((value, key) => {
        headersObj[key] = value;
      });

      let data: unknown;
      if (typeof init?.body === "string") {
        try {
          data = JSON.parse(init.body);
        } catch {
          data = init.body;
        }
      } else if (init?.body != null) {
        data = init.body;
      }

      const response = await CapacitorHttp.request({
        url,
        method: (init?.method ?? "GET").toUpperCase(),
        headers: headersObj,
        data,
      });

      if (needsCookies) await storeResponseCookies(url, response.headers as Record<string, string>);

      const isStringBody = typeof response.data === "string";
      const responseBody = isStringBody ? (response.data as string) : JSON.stringify(response.data);
      return new Response(responseBody, {
        status: response.status,
        headers: response.headers as Record<string, string>,
      });
    }

    const patched = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const isRelativeApiCall = url.startsWith("/api/");
      const isAbsoluteApiCall = url.startsWith(PRODUCTION_API_ORIGIN);

      if (!isRelativeApiCall && !isAbsoluteApiCall) return originalFetch(input, init);

      // Only NextAuth's own cookie-session endpoints need the cookie
      // round trip (each direction is its own extra native bridge call).
      // Every other route authenticates purely via the Bearer token
      // (resolveUserIdForDataApi) and never reads the session cookie at
      // all — paying for cookie sync on those too was adding 2 extra
      // bridge round trips to EVERY data fetch in the app (dashboard alone
      // fires a dozen+ on load, plus the cardio-live poll every 5s
      // forever in the background), saturating the bridge's message queue
      // badly enough that WKWebView's content process stopped responding
      // to touch input entirely (`WebProcessProxy::didBecomeUnresponsive`
      // in the device console — taps did nothing at all).
      const isAuthCookieCall = (isRelativeApiCall ? url : url.slice(PRODUCTION_API_ORIGIN.length)).startsWith("/api/auth/");
      const rewrittenUrl = isRelativeApiCall ? PRODUCTION_API_ORIGIN + url : url;

      const buildHeaders = async (): Promise<Headers> => {
        const headers = new Headers(init?.headers);
        if (!isAuthCookieCall && !headers.has("Authorization")) {
          const token = await getCachedToken();
          if (token) headers.set("Authorization", `Bearer ${token}`);
        }
        return headers;
      };

      const res = await requestViaNativeBridge(rewrittenUrl, init, await buildHeaders(), isAuthCookieCall);

      // A 401 on a Bearer-authed call means the cached token is stale (rotated
      // or expired) — drop the cache, re-read the Keychain once, and retry.
      // Self-heals without every other call paying for a Keychain read.
      if (res.status === 401 && !isAuthCookieCall && !new Headers(init?.headers).has("Authorization")) {
        clearCachedToken();
        return requestViaNativeBridge(rewrittenUrl, init, await buildHeaders(), isAuthCookieCall);
      }
      return res;
    };
    patched.__nativeAuthPatched = true;
    window.fetch = patched as typeof window.fetch;
  }, []);

  return null;
}
