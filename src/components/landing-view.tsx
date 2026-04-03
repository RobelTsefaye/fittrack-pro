"use client";

import Link from "next/link";
import { Dumbbell, TrendingUp, Brain, ArrowRight } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { useI18n } from "@/lib/i18n-provider";
import { LOCALE_COOKIE } from "@/lib/i18n-config";
import type { UiLocale } from "@/lib/i18n-config";
import { cn } from "@/lib/utils";

function LandingLocaleSwitch() {
  const { t, locale } = useI18n();

  function setLang(l: UiLocale) {
    document.cookie = `${LOCALE_COOKIE}=${l};path=/;max-age=31536000;SameSite=Lax`;
    window.location.reload();
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
      <span>{t("landing.language")}:</span>
      <button
        type="button"
        className={cn("underline-offset-2 hover:underline", locale === "en" && "font-semibold text-foreground")}
        onClick={() => setLang("en")}
      >
        English
      </button>
      <span aria-hidden>·</span>
      <button
        type="button"
        className={cn("underline-offset-2 hover:underline", locale === "de" && "font-semibold text-foreground")}
        onClick={() => setLang("de")}
      >
        Deutsch
      </button>
    </div>
  );
}

export function LandingView() {
  const { t } = useI18n();

  return (
    <main className="flex min-h-screen flex-col">
      <section className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary">
            <Dumbbell className="h-8 w-8 text-primary-foreground" />
          </div>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{APP_NAME}</h1>

          <p className="text-lg text-muted-foreground">{t("landing.tagline")}</p>

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/register"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t("landing.getStarted")}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-6 text-sm font-medium transition-colors hover:bg-muted"
            >
              {t("landing.signIn")}
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t bg-muted/40 px-4 py-16">
        <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-3">
          <div className="space-y-2 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Dumbbell className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-semibold">{t("landing.featureWorkoutsTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("landing.featureWorkoutsDesc")}</p>
          </div>
          <div className="space-y-2 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-semibold">{t("landing.featureProgressTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("landing.featureProgressDesc")}</p>
          </div>
          <div className="space-y-2 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-semibold">{t("landing.featureAiTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("landing.featureAiDesc")}</p>
          </div>
        </div>
      </section>

      <footer className="border-t px-4 py-4 text-center text-xs text-muted-foreground space-y-3">
        <LandingLocaleSwitch />
        <p>{t("landing.footer")}</p>
      </footer>
    </main>
  );
}
