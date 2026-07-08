import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { APP_NAME } from "@/lib/constants";
import { BackButton } from "@/components/layout/back-button";
import { SettingsPageContent } from "@/features/settings/components/settings-page-content";
import { LOCALE_COOKIE, prismaLocaleFromCookieString } from "@/lib/i18n-config";

export const metadata = { title: `Settings — ${APP_NAME}` };

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
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

  const initial = {
    locale: settings.locale,
    weightUnit: settings.weightUnit,
    theme: settings.theme,
    restTimerDefault: settings.restTimerDefault,
  };

  return (
    <>
      <BackButton />
      <SettingsPageContent
        name={session.user.name}
        email={session.user.email}
        initial={initial}
      />
    </>
  );
}
