"use client";

import Link from "@/components/app-link";
import { Dumbbell } from "lucide-react";
import { useI18n } from "@/lib/i18n-provider";
import { APP_NAME } from "@/lib/constants";

/** Hinweis statt Formular, wenn die Registrierung (FITTRACK_REGISTRATION=closed) geschlossen ist. */
export function RegistrationClosed() {
  const { t } = useI18n();
  return (
    <div className="w-full max-w-sm px-5 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[18px] bg-foreground shadow-lg shadow-black/20">
        <Dumbbell className="h-8 w-8 text-background" />
      </div>
      <h1 className="text-[1.625rem] font-bold tracking-tight">{t("auth.register.closedTitle")}</h1>
      <p className="mt-1 text-sm text-[var(--sys-label2)]">{APP_NAME}</p>
      <p role="status" className="mt-6 text-sm text-[var(--sys-label2)]">
        {t("auth.register.closedBody")}
      </p>
      <Link
        href="/login"
        className="mt-6 inline-block text-sm font-semibold text-primary hover:opacity-80"
      >
        {t("auth.register.signIn")}
      </Link>
    </div>
  );
}
