"use client";

import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

/**
 * Thin wrappers around @capacitor/haptics. No-ops entirely on web/PWA where
 * Capacitor.isNativePlatform() is false — safe to call unconditionally from
 * any client component/hook without branching at every call site.
 */

/** Light tap — use for a set marked as completed. */
export async function hapticSetCompleted(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* unsupported device / simulator */
  }
}

/** Stronger success feedback — use for a new personal record. */
export async function hapticPersonalRecord(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    /* unsupported device / simulator */
  }
}

/** Notification-style feedback — use when the rest timer expires. */
export async function hapticRestTimerExpired(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Haptics.notification({ type: NotificationType.Warning });
  } catch {
    /* unsupported device / simulator */
  }
}

/** Success feedback — use when a whole workout is completed. */
export async function hapticWorkoutCompleted(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    /* unsupported device / simulator */
  }
}
