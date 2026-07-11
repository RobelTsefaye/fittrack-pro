"use client";

import { loadNativeAuthToken } from "@/lib/native/native-auth-token";

/**
 * In-memory cache around the Keychain-backed native auth token.
 *
 * `loadNativeAuthToken()` is a Keychain read over the Capacitor bridge — cheap
 * once, but it was being called on EVERY protected-page mount (RequireAuth →
 * useAuthGate) and EVERY API request (the fetch patch attaching the Bearer
 * token). On native that's two bridge round trips per data fetch plus one per
 * navigation, all serialized on the same bridge as the cardio-live poll and
 * the startup HealthKit sync. Under that contention a per-navigation Keychain
 * read could stall long enough that RequireAuth sat on its `null` (blank)
 * branch — the page "never opened."
 *
 * The token only changes at login/logout, so it's safe to read once and reuse.
 * `setCachedToken` keeps the cache correct when a fresh token is minted
 * (login-form), and `clearCachedToken` lets the fetch patch self-heal on a 401
 * by forcing a re-read.
 */
let cached: string | null | undefined;

/** Synchronous peek — `undefined` means "not read yet". */
export function peekCachedToken(): string | null | undefined {
  return cached;
}

export async function getCachedToken(): Promise<string | null> {
  if (cached !== undefined) return cached;
  cached = await loadTokenWithRetry();
  return cached;
}

/**
 * A cold app launch fires this Keychain read alongside several other native
 * bridge round trips at once (HealthKit sync, push registration,
 * WatchConnectivity listeners, ...) — under that contention the very first
 * read can occasionally come back empty even though the token is genuinely
 * stored (`loadNativeAuthToken` swallows any plugin-call failure to `null`,
 * indistinguishable here from "never logged in"). `useAuthGate` takes a
 * `null` at face value and `require-auth.tsx` bounces straight to /login —
 * offline, nothing else can recover a user from that, since a fresh login
 * needs a network round trip that doesn't exist. Retrying a couple of times
 * costs nothing when a token IS present (the first read already succeeds,
 * the common case) and adds well under a second when it's genuinely absent.
 */
async function loadTokenWithRetry(): Promise<string | null> {
  for (const delayMs of [0, 150, 350]) {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const token = await loadNativeAuthToken();
    if (token) return token;
  }
  return null;
}

export function setCachedToken(token: string | null): void {
  cached = token;
}

/** Force the next getCachedToken() to hit the Keychain again. */
export function clearCachedToken(): void {
  cached = undefined;
}
