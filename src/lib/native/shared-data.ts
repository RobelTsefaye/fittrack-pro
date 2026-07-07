"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

interface SharedDataPlugin {
  setRecoverySnapshot(options: { score: number; level: string }): Promise<void>;
}

const SharedData = registerPlugin<SharedDataPlugin>("SharedData");

/**
 * Writes the latest recovery score into the shared App Group storage the
 * Recovery Score home-screen widget reads from (RecoveryScoreWidget.swift).
 * No-ops on web/PWA.
 */
export async function syncRecoveryWidgetSnapshot(score: number, level: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await SharedData.setRecoverySnapshot({ score, level });
  } catch {
    // Non-fatal — widget just keeps showing its last-known value.
  }
}
