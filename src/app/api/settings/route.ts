import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { updateSettingsSchema } from "@/features/settings/schemas";
import {
  LOCALE_COOKIE,
  prismaLocaleFromCookieString,
  prismaLocaleToUi,
} from "@/lib/i18n-config";
import { cookies } from "next/headers";

export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let settings = await prisma.userSettings.findUnique({
    where: { userId },
  });

  if (!settings) {
    const cookieStore = await cookies();
    const localeFromCookie = prismaLocaleFromCookieString(
      cookieStore.get(LOCALE_COOKIE)?.value
    );
    settings = await prisma.userSettings.create({
      data: { userId, locale: localeFromCookie },
    });
  }

  return NextResponse.json({
    data: {
      locale: settings.locale,
      weightUnit: settings.weightUnit,
      theme: settings.theme,
      restTimerDefault: settings.restTimerDefault,
      calendarSyncEnabled: settings.calendarSyncEnabled,
      trainingWeekdays: settings.trainingWeekdays,
      trainingTimeMinutes: settings.trainingTimeMinutes,
      trainingDurationMinutes: settings.trainingDurationMinutes,
      cardioSyncEnabled: settings.cardioSyncEnabled,
      cardioWeekdays: settings.cardioWeekdays,
      cardioTimeMinutes: settings.cardioTimeMinutes,
      cardioDurationMinutes: settings.cardioDurationMinutes,
      cardioLabel: settings.cardioLabel,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = updateSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const patch = { ...parsed.data };
  const data = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined)
  ) as typeof patch;

  const existing = await prisma.userSettings.findUnique({
    where: { userId },
  });

  if (existing) {
    await prisma.userSettings.update({
      where: { userId },
      data,
    });
  } else {
    await prisma.userSettings.create({
      data: { userId, ...data },
    });
  }

  const updated = await prisma.userSettings.findUniqueOrThrow({
    where: { userId },
  });

  const res = NextResponse.json({
    data: {
      locale: updated.locale,
      weightUnit: updated.weightUnit,
      theme: updated.theme,
      restTimerDefault: updated.restTimerDefault,
      calendarSyncEnabled: updated.calendarSyncEnabled,
      trainingWeekdays: updated.trainingWeekdays,
      trainingTimeMinutes: updated.trainingTimeMinutes,
      trainingDurationMinutes: updated.trainingDurationMinutes,
      cardioSyncEnabled: updated.cardioSyncEnabled,
      cardioWeekdays: updated.cardioWeekdays,
      cardioTimeMinutes: updated.cardioTimeMinutes,
      cardioDurationMinutes: updated.cardioDurationMinutes,
      cardioLabel: updated.cardioLabel,
    },
  });

  const ui = prismaLocaleToUi(updated.locale);
  res.cookies.set(LOCALE_COOKIE, ui, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  return res;
}
