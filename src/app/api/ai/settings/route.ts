import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read-only: unlike GET /api/settings, this never creates a UserSettings
  // row on a cache miss — an AI query has no browser-locale cookie to seed
  // it with, and a read endpoint shouldn't have that side effect anyway.
  const settings = await prisma.userSettings.findUnique({ where: { userId } });

  return NextResponse.json({
    data: {
      schemaVersion: "1.0",
      kind: "settings",
      generatedAt: new Date().toISOString(),
      // Non-sensitive preferences only — never tokens, passwords, or
      // anything from ApiToken/PushToken.
      locale: settings?.locale ?? null,
      weightUnit: settings?.weightUnit ?? null,
      theme: settings?.theme ?? null,
      restTimerDefault: settings?.restTimerDefault ?? null,
      calendarSyncEnabled: settings?.calendarSyncEnabled ?? false,
      trainingWeekdays: settings?.trainingWeekdays ?? [],
      trainingTimeMinutes: settings?.trainingTimeMinutes ?? null,
      trainingDurationMinutes: settings?.trainingDurationMinutes ?? null,
      cardioSyncEnabled: settings?.cardioSyncEnabled ?? false,
      cardioWeekdays: settings?.cardioWeekdays ?? [],
      cardioTimeMinutes: settings?.cardioTimeMinutes ?? null,
      cardioDurationMinutes: settings?.cardioDurationMinutes ?? null,
      cardioLabel: settings?.cardioLabel ?? null,
    },
    meta: { endpoint: "settings" },
  });
}
