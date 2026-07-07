"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { registerPushNotifications } from "@/lib/native/push-notifications";

/**
 * Registers this device for push notifications once the user is logged in.
 * No-ops on web/PWA (registerPushNotifications checks Capacitor.isNativePlatform()
 * internally) — safe to mount unconditionally alongside PwaRegister.
 */
export function NativePushRegister() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    void registerPushNotifications();
  }, [status]);

  return null;
}
