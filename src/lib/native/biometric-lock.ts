"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

interface BiometricLockPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  authenticate(): Promise<{ success: boolean }>;
}

const BiometricLock = registerPlugin<BiometricLockPlugin>("BiometricLock");

/** No-ops (always "unavailable") on web/PWA. */
export async function isBiometricLockAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { available } = await BiometricLock.isAvailable();
    return available;
  } catch {
    return false;
  }
}

/** Resolves true only on a successful Face ID / Touch ID / passcode check. */
export async function authenticateWithBiometrics(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const { success } = await BiometricLock.authenticate();
    return success;
  } catch {
    return false;
  }
}
