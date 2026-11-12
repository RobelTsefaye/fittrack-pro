"use client";

import { useEffect } from "react";
import Link from "@/components/app-link";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-provider";

/**
 * Gemeinsame Fehleransicht für `error.tsx` (Root und `(app)`).
 * Zeigt keine Fehlerdetails; der Fehler selbst geht nur an die Konsole.
 */
export function ErrorView({
  error,
  retry,
  homeHref,
  homeLabelKey,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  homeHref: string;
  homeLabelKey: "errorPage.goTraining" | "errorPage.goHome";
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto flex min-h-[50vh] max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center"
    >
      <h1 className="text-xl font-semibold">{t("errorPage.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("errorPage.description")}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={() => retry()}>
          {t("errorPage.retry")}
        </Button>
        <Link
          href={homeHref}
          className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-primary hover:underline"
        >
          {t(homeLabelKey)}
        </Link>
      </div>
    </div>
  );
}
