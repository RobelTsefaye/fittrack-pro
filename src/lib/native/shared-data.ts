"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

interface SharedDataPlugin {
  setRecoverySnapshot(options: { score: number; level: string }): Promise<void>;
  setNextWorkoutSnapshot(options: {
    streak: number;
    sessionName?: string | null;
    planName?: string | null;
    sessionId?: string | null;
  }): Promise<void>;
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

/**
 * Writes the next scheduled workout session + current streak into the
 * shared App Group storage the "Nächstes Workout" home-screen widget reads
 * from (NextWorkoutWidget.swift). sessionName/planName null = no active
 * plan. No-ops on web/PWA.
 */
export async function syncNextWorkoutWidgetSnapshot(
  streak: number,
  sessionName: string | null,
  planName: string | null,
  sessionId: string | null
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await SharedData.setNextWorkoutSnapshot({ streak, sessionName, planName, sessionId });
  } catch {
    // Non-fatal — widget just keeps showing its last-known value.
  }
}
