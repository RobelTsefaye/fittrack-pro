import type { Messages } from "@/lib/i18n-types";
import en from "@/messages/en.json";
import de from "@/messages/de.json";
import type { UiLocale } from "@/lib/i18n-config";

const bundles: Record<UiLocale, Messages> = {
  en,
  de,
};

export function getMessages(locale: UiLocale): Messages {
  return bundles[locale] ?? bundles.en;
}
