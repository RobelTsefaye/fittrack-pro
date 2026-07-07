"use client";

import { Capacitor } from "@capacitor/core";
import { PushNotifications, type Token, type PushNotificationSchema } from "@capacitor/push-notifications";

/**
 * Registers this device for push notifications and syncs the APNs token
 * to the backend. No-ops entirely on web/PWA — Capacitor.isNativePlatform()
 * is false there, so this is safe to call unconditionally from a top-level
 * client component without branching at every call site.
 */
export async function registerPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const permission = await PushNotifications.checkPermissions();
  if (permission.receive !== "granted") {
    const requested = await PushNotifications.requestPermissions();
    if (requested.receive !== "granted") return;
  }

  await PushNotifications.register();

  PushNotifications.addListener("registration", (token: Token) => {
    void syncPushToken(token.value);
  });

  PushNotifications.addListener("registrationError", (err) => {
    console.error("[push] registration failed", err);
  });

  // Foreground notification — the OS doesn't show a banner automatically
  // while the app is active, so surface it ourselves via a simple in-app
  // toast hook point (left as a console log until a toast system is wired
  // in; the payload shape is already correct for that hookup).
  PushNotifications.addListener("pushNotificationReceived", (notification: PushNotificationSchema) => {
    console.log("[push] received in foreground", notification);
  });

  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    console.log("[push] tapped", action.notification);
  });
}

async function syncPushToken(token: string): Promise<void> {
  try {
    await fetch("/api/push-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token, platform: Capacitor.getPlatform() }),
    });
  } catch (err) {
    console.error("[push] failed to sync token to server", err);
  }
}
