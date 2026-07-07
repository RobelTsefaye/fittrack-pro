"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

interface SyncTokenPlugin {
  store(options: { token: string }): Promise<void>;
  hasToken(): Promise<{ hasToken: boolean }>;
  clear(): Promise<void>;
}

const SyncToken = registerPlugin<SyncTokenPlugin>("SyncToken");

/**
 * Stores an API token (from Settings → API Tokens) in the Keychain so
 * BackgroundSyncManager (native) can authenticate a periodic background
 * HealthKit sync without a live WKWebView session cookie. Storing also
 * schedules the first background task run natively.
 */
export async function storeBackgroundSyncToken(token: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await SyncToken.store({ token });
    return true;
  } catch {
    return false;
  }
}

export async function hasBackgroundSyncToken(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { hasToken } = await SyncToken.hasToken();
    return hasToken;
  } catch {
    return false;
  }
}

export async function clearBackgroundSyncToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await SyncToken.clear();
  } catch {
    // Non-fatal.
  }
}
