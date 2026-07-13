"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { getCachedToken } from "@/lib/native/auth-token-cache";
import { registerPushNotifications } from "@/lib/native/push-notifications";

/**
 * Registers this device for push notifications once the user is logged in.
 * No-ops on web/PWA (registerPushNotifications checks Capacitor.isNativePlatform()
 * internally) — safe to mount unconditionally alongside PwaRegister.
 *
 * On native, gated on the actual Bearer token (via getCachedToken()) rather
 * than useSession().status — that cookie-backed session is only
 * best-effort synced on native and can silently die while the token stays
 * valid, which would otherwise stop push registration entirely with
 * everything else in the app still working. Web keeps using the session
 * status (no Bearer token concept there, and registerPushNotifications is a
 * no-op anyway).
 */
export function NativePushRegister() {
  const { status } = useSession();
  const [nativeReady, setNativeReady] = useState(!Capacitor.isNativePlatform());

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void getCachedToken().then((token) => setNativeReady(token != null));
  }, []);

  useEffect(() => {
    const ready = Capacitor.isNativePlatform() ? nativeReady : status === "authenticated";
    if (!ready) return;
    void registerPushNotifications();
  }, [status, nativeReady]);

  return null;
}
