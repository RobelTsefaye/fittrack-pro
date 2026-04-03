export const LOCALE_COOKIE = "fittrack-locale";

export type UiLocale = "en" | "de";

export function prismaLocaleToUi(locale: string | null | undefined): UiLocale {
  if (locale === "DE") return "de";
  return "en";
}

export function uiLocaleToPrisma(locale: string | null | undefined): "EN" | "DE" {
  return locale === "de" || locale === "DE" ? "DE" : "EN";
}

export function parseLocaleCookie(value: string | null | undefined): UiLocale {
  if (value === "de" || value === "DE") return "de";
  return "en";
}

/** Map cookie / UI locale to Prisma `AppLocale` when creating `UserSettings`. */
export function prismaLocaleFromCookieString(value: string | null | undefined): "EN" | "DE" {
  return parseLocaleCookie(value) === "de" ? "DE" : "EN";
}
