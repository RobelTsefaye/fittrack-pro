import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateSettingsSchema } from "@/features/settings/schemas";
import {
  LOCALE_COOKIE,
  prismaLocaleFromCookieString,
  prismaLocaleToUi,
} from "@/lib/i18n-config";
import { cookies } from "next/headers";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  });

  if (!settings) {
    const cookieStore = await cookies();
    const localeFromCookie = prismaLocaleFromCookieString(
      cookieStore.get(LOCALE_COOKIE)?.value
    );
    settings = await prisma.userSettings.create({
      data: { userId: session.user.id, locale: localeFromCookie },
    });
  }

  return NextResponse.json({
    data: {
      locale: settings.locale,
      weightUnit: settings.weightUnit,
      theme: settings.theme,
      restTimerDefault: settings.restTimerDefault,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
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
    where: { userId: session.user.id },
  });

  if (existing) {
    await prisma.userSettings.update({
      where: { userId: session.user.id },
      data,
    });
  } else {
    await prisma.userSettings.create({
      data: { userId: session.user.id, ...data },
    });
  }

  const updated = await prisma.userSettings.findUniqueOrThrow({
    where: { userId: session.user.id },
  });

  const res = NextResponse.json({
    data: {
      locale: updated.locale,
      weightUnit: updated.weightUnit,
      theme: updated.theme,
      restTimerDefault: updated.restTimerDefault,
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
