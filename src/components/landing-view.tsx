"use client";

import Link from "next/link";
import { Dumbbell, TrendingUp, Brain, ArrowRight, Wifi } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { useI18n } from "@/lib/i18n-provider";
import { LOCALE_COOKIE } from "@/lib/i18n-config";
import type { UiLocale } from "@/lib/i18n-config";
import { cn } from "@/lib/utils";

// Defined at module scope so the DOM mutation (document.cookie) isn't inside a
// component/hook body, which the React Compiler's immutability rule forbids.
function applyLocale(l: UiLocale) {
  document.cookie = `${LOCALE_COOKIE}=${l};path=/;max-age=31536000;SameSite=Lax`;
  window.location.reload();
}

function LandingLocaleSwitch() {
  const { t, locale } = useI18n();
  return (
    <div className="flex items-center justify-center gap-3 text-xs text-[var(--sys-label3)]">
      <span>{t("landing.language")}:</span>
      {(["en", "de"] as UiLocale[]).map((l) => (
        <button
          key={l}
          type="button"
          className={cn(
            "transition-colors",
            locale === l
              ? "font-semibold text-foreground"
              : "hover:text-foreground/70"
          )}
          onClick={() => applyLocale(l)}
        >
          {l === "en" ? "English" : "Deutsch"}
        </button>
      ))}
    </div>
  );
}

const features = [
  {
    icon: Dumbbell,
    titleKey: "landing.featureWorkoutsTitle" as const,
    descKey:  "landing.featureWorkoutsDesc"  as const,
  },
  {
    icon: TrendingUp,
    titleKey: "landing.featureProgressTitle" as const,
    descKey:  "landing.featureProgressDesc"  as const,
  },
  {
    icon: Brain,
    titleKey: "landing.featureAiTitle"       as const,
    descKey:  "landing.featureAiDesc"        as const,
  },
  {
    icon: Wifi,
    titleKey: "landing.featureOfflineTitle"  as const,
    descKey:  "landing.featureOfflineDesc"   as const,
  },
];

export function LandingView() {
  const { t } = useI18n();

  return (
    <main className="flex min-h-screen flex-col bg-[var(--sys-grouped-bg)]">

      {/* ── Hero ───────────────────────────────────── */}
      <section className="flex flex-1 flex-col items-center justify-center px-5 py-20 text-center">
        {/* App icon */}
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-[22px] bg-foreground shadow-xl shadow-black/20">
          <Dumbbell className="h-10 w-10 text-background" />
        </div>

        <h1 className="page-title mb-3">{APP_NAME}</h1>

        <p className="mb-10 max-w-xs text-[1.0625rem] leading-relaxed text-[var(--sys-label2)]">
          {t("landing.tagline")}
        </p>

        {/* CTAs */}
        <div className="flex w-full max-w-xs flex-col gap-3">
          <Link
            href="/register"
            className={cn(
              "flex h-12 items-center justify-center gap-2 rounded-2xl",
              "bg-primary text-primary-foreground",
              "text-[0.9375rem] font-semibold shadow-md shadow-black/12",
              "transition-opacity hover:opacity-90 active:opacity-75 active:scale-[0.98]",
              "transition-all duration-150"
            )}
          >
            {t("landing.getStarted")}
            <ArrowRight className="h-4.5 w-4.5" />
          </Link>
          <Link
            href="/login"
            className={cn(
              "flex h-12 items-center justify-center rounded-2xl",
              "bg-card border border-border",
              "text-[0.9375rem] font-medium text-foreground",
              "shadow-sm shadow-black/5",
              "transition-opacity hover:opacity-80 active:opacity-60 active:scale-[0.98]",
              "transition-all duration-150"
            )}
          >
            {t("landing.signIn")}
          </Link>
        </div>
      </section>

      {/* ── Features ───────────────────────────────── */}
      <section className="px-5 pb-16">
        <div className="ios-group mx-auto max-w-md">
          {features.map(({ icon: Icon, titleKey, descKey }, i) => (
            <div key={i} className="ios-row gap-4 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-[0.9375rem]">{t(titleKey)}</p>
                <p className="mt-0.5 text-sm text-[var(--sys-label2)]">{t(descKey)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────── */}
      <footer className="border-t border-border px-5 py-5 text-center space-y-3">
        <LandingLocaleSwitch />
        <p className="text-xs text-[var(--sys-label3)]">{t("landing.footer")}</p>
      </footer>
    </main>
  );
}
