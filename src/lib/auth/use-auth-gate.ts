"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { getCachedToken, peekCachedToken } from "@/lib/native/auth-token-cache";

export type AuthGateState = "checking" | "authenticated" | "unauthenticated";

function nativeStateFromToken(token: string | null): AuthGateState {
  return token ? "authenticated" : "unauthenticated";
}

/**
 * Client-side replacement for middleware.ts's session gate — needed because
 * a statically-exported build (project-docs/offline-first-roadmap.md
 * Phase 2) has no server to run middleware or `await auth()` on; the exported
 * pages are pre-rendered once at build time, not per-request. `middleware.ts`
 * itself is untouched and keeps gating the separate Vercel-hosted web
 * deployment exactly as before — this hook is what the native (and, since it
 * has to run somewhere anyway, the web) client-rendered pages check instead.
 *
 * On native, this is a LOCAL Keychain read — no network round trip, so it
 * works fully offline (the entire point of this phase): a stored token is
 * trusted optimistically rather than re-validated against the server on
 * every page load. On web, defers to the existing NextAuth cookie session
 * via `useSession()` — completely unchanged behavior there.
 */
export function useAuthGate(): AuthGateState {
  const { status } = useSession();
  const isNative = Capacitor.isNativePlatform();
  // Seed from the app-wide cache synchronously: after the first read (the very
  // first protected page), every later navigation resolves the gate on the
  // initial render with no Keychain/bridge round trip — so a congested bridge
  // can never leave a freshly-navigated page stuck on RequireAuth's blank
  // branch. Only the genuine first mount starts in "checking".
  const [nativeState, setNativeState] = useState<AuthGateState>(() => {
    if (!isNative) return "authenticated";
    const peeked = peekCachedToken();
    return peeked === undefined ? "checking" : nativeStateFromToken(peeked);
  });

  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    void getCachedToken().then((token) => {
      if (!cancelled) setNativeState(nativeStateFromToken(token));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isNative) return nativeState;
  if (status === "loading") return "checking";
  return status === "authenticated" ? "authenticated" : "unauthenticated";
}
