import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  LOCALE_COOKIE,
  parseLocaleCookie,
  prismaLocaleToUi,
  type UiLocale,
} from "@/lib/i18n-config";

/**
 * Single locale source for the whole tree: cookie for guests; for signed-in users
 * prefer `UserSettings.locale`, falling back to cookie if no row exists yet.
 */
export async function resolveAppLocale(): Promise<UiLocale> {
  const cookieStore = await cookies();
  const cookieLocale = parseLocaleCookie(cookieStore.get(LOCALE_COOKIE)?.value);

  const session = await auth();
  if (!session?.user?.id) {
    return cookieLocale;
  }

  // Use raw SQL so a stale Prisma client (e.g. cached `globalThis.prisma` in dev after pulling
  // schema changes) does not throw PrismaClientValidationError on `select: { locale: true }`.
  try {
    const rows = await prisma.$queryRaw<Array<{ locale: string }>>`
      SELECT locale::text AS locale
      FROM user_settings
      WHERE "userId" = ${session.user.id}
      LIMIT 1
    `;
    const row = rows[0];
    if (row?.locale) {
      return prismaLocaleToUi(row.locale);
    }
  } catch (e) {
    console.warn(
      "[i18n] Could not read user_settings.locale (run migrations + `npx prisma generate`, restart dev server). Using cookie locale.",
      e
    );
  }

  return cookieLocale;
}
