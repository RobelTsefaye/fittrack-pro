"use client";

import { useI18n } from "@/lib/i18n-provider";
import { ApiTokensCard } from "./api-tokens-card";
import { SettingsForm } from "./settings-form";

type InitialSettings = {
  locale: "EN" | "DE";
  weightUnit: "KG" | "LB";
  theme: "LIGHT" | "DARK" | "SYSTEM";
  restTimerDefault: number;
};

export function SettingsPageContent({
  name,
  email,
  initial,
}: {
  name?: string | null;
  email?: string | null;
  initial: InitialSettings;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-8">

      {/* ── Page header ─────────────────────────────── */}
      <div>
        <h1 className="page-title">{t("settings.title")}</h1>
        <p className="mt-0.5 text-sm text-[var(--sys-label2)]">{t("settings.subtitle")}</p>
      </div>

      {/* ── Profile ─────────────────────────────────── */}
      <section className="space-y-2">
        <p className="ios-section-label">{t("settings.profile")}</p>
        <div className="ios-group">
          <div className="ios-row">
            <span className="flex-1 text-[0.9375rem]">{t("settings.name")}</span>
            <span className="text-[0.9375rem] text-[var(--sys-label2)] truncate max-w-[60%] text-right">
              {name ?? "—"}
            </span>
          </div>
          <div className="ios-row">
            <span className="flex-1 text-[0.9375rem]">{t("settings.email")}</span>
            <span className="text-[0.9375rem] text-[var(--sys-label2)] truncate max-w-[60%] text-right">
              {email ?? "—"}
            </span>
          </div>
        </div>
      </section>

      {/* ── Cross-device ────────────────────────────── */}
      <section className="space-y-2">
        <p className="ios-section-label">{t("settings.crossDeviceTitle")}</p>
        <div className="ios-group">
          {process.env.NEXT_PUBLIC_APP_URL && (
            <div className="ios-row flex-col items-start gap-1 py-3">
              <span className="text-[0.9375rem]">{t("settings.crossDeviceUrlLabel")}</span>
              <code className="block w-full break-all rounded-lg bg-[var(--sys-fill)] px-3 py-2 text-xs text-[var(--sys-label2)] mt-1">
                {process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}
              </code>
            </div>
          )}
          <div className="ios-row flex-col items-start gap-1 py-3">
            <p className="text-sm text-[var(--sys-label2)]">{t("settings.crossDeviceHint")}</p>
          </div>
          <div className="ios-row flex-col items-start gap-1 py-3">
            <p className="text-xs text-[var(--sys-label3)]">{t("settings.crossDeviceSyncNote")}</p>
          </div>
        </div>
      </section>

      {/* ── API Tokens ──────────────────────────────── */}
      <ApiTokensCard />

      {/* ── Preferences + Export ────────────────────── */}
      <SettingsForm initial={initial} />
    </div>
  );
}
