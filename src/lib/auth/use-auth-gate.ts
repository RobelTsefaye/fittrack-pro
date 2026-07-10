"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { loadNativeAuthToken } from "@/lib/native/native-auth-token";

export type AuthGateState = "checking" | "authenticated" | "unauthenticated";

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
  const [nativeState, setNativeState] = useState<AuthGateState>(isNative ? "checking" : "authenticated");

  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    void loadNativeAuthToken().then((token) => {
      if (!cancelled) setNativeState(token ? "authenticated" : "unauthenticated");
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
