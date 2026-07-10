"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Keychain-backed storage for the native app's own login token — see
 * project-docs/offline-first-roadmap.md Phase 1 and
 * NativeAuthTokenPlugin.swift's doc comment for why this is a SEPARATE
 * mechanism from the existing "Für Hintergrund-Sync verwenden" token
 * (@/lib/native/sync-token): that one is an opt-in convenience for native
 * background code; this one is becoming this app's actual sign-in
 * credential once static export removes the server session cookie.
 */
interface NativeAuthTokenPlugin {
  save(options: { token: string }): Promise<{ success: boolean }>;
  load(): Promise<{ token: string | null }>;
  clear(): Promise<{ success: boolean }>;
}

const NativeAuthToken = registerPlugin<NativeAuthTokenPlugin>("NativeAuthToken");

export async function saveNativeAuthToken(token: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { success } = await NativeAuthToken.save({ token });
    return success;
  } catch {
    return false;
  }
}

export async function loadNativeAuthToken(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { token } = await NativeAuthToken.load();
    return token;
  } catch {
    return null;
  }
}

export async function clearNativeAuthToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NativeAuthToken.clear();
  } catch {
    // Best-effort — a stale token left behind just means the next
    // authenticatedFetch call fails with 401 rather than silently misusing it.
  }
}

/**
 * `fetch` wrapper that attaches the stored native token as a Bearer header
 * when running natively — the same `resolveUserIdForDataApi` path already
 * used by WatchAPIProxy/the PiP SSE stream. On web (no native token), this is
 * a plain `fetch` and relies on the existing session cookie exactly as today
 * — nothing changes there. Not wired into any page yet (that's Phase 2); this
 * exists now so it can be tested standalone against a Bearer-protected route.
 */
export async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = await loadNativeAuthToken();
  if (!token) return fetch(input, init);

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
