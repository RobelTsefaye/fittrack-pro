"use client";

import Link from "@/components/app-link";
import { useI18n } from "@/lib/i18n-provider";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <h1 className="text-xl font-semibold">{t("errorPage.notFoundTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("errorPage.notFoundDescription")}</p>
      <Link
        href="/"
        className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-primary hover:underline"
      >
        {t("errorPage.goHome")}
      </Link>
    </div>
  );
}
