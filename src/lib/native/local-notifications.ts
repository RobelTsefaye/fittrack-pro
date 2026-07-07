"use client";

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

/**
 * Local (non-push) notification for the rest timer's expiry. No APNs, no
 * paid developer account, and no extra iOS entitlement needed — just the
 * standard UNUserNotificationCenter permission, which Capacitor requests on
 * our behalf the first time `scheduleRestTimerNotification` is called (not
 * at app start, so the permission dialog has context).
 *
 * A single fixed notification id is used since only one rest timer can run
 * at a time — scheduling a new one implicitly should first cancel any
 * pending one via `cancelRestTimerNotification`.
 */
const REST_TIMER_NOTIFICATION_ID = 424_242;

let permissionRequested = false;

async function ensurePermission(): Promise<boolean> {
  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted") return true;
  if (permissionRequested) return false;
  permissionRequested = true;
  const requested = await LocalNotifications.requestPermissions();
  return requested.display === "granted";
}

/**
 * Schedules a local notification to fire at `endsAt` (ms epoch) announcing
 * the rest period is over. No-ops on web/PWA. Cancels any previously
 * scheduled rest-timer notification first so only one is ever pending.
 */
export async function scheduleRestTimerNotification(
  endsAt: number,
  title = "Rest vorbei",
  body = "Zeit fürs nächste Set"
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: REST_TIMER_NOTIFICATION_ID }],
    });
    const granted = await ensurePermission();
    if (!granted) return;
    if (endsAt <= Date.now()) return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REST_TIMER_NOTIFICATION_ID,
          title,
          body,
          schedule: { at: new Date(endsAt) },
        },
      ],
    });
  } catch (err) {
    console.error("[local-notifications] schedule failed", err);
  }
}

/**
 * Cancels the pending rest-timer notification (stop/reset/adjust). Safe to
 * call even if none is scheduled. No-ops on web/PWA.
 */
export async function cancelRestTimerNotification(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: REST_TIMER_NOTIFICATION_ID }],
    });
  } catch (err) {
    console.error("[local-notifications] cancel failed", err);
  }
}
