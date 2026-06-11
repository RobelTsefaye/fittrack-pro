"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n-provider";

// The iOS Shortcut JSON payload structure — shown to users as reference
const SHORTCUT_PAYLOAD = `{
  "date": "YYYY-MM-DD",
  "sleepDuration": 7.5,
  "sleepBedtime": "23:00",
  "sleepWakeTime": "06:30",
  "restingHeartRate": 58,
  "hrv": 52,
  "steps": 9200,
  "activeCalories": 480,
  "exerciseMinutes": 45,
  "vo2Max": 42.5,
  "water": 2000
}`;

const STEPS = [
  { key: "step1", descKey: "step1desc", emoji: "🔑" },
  { key: "step2", descKey: "step2desc", emoji: "📲" },
  { key: "step3", descKey: "step3desc", emoji: "⚙️" },
  { key: "step4", descKey: "step4desc", emoji: "⏰" },
] as const;

export function ShortcutGuide() {
  const { t } = useI18n();
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);

  const apiUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/health-data`
      : "https://your-app.vercel.app/api/health-data";

  function copyUrl() {
    void navigator.clipboard.writeText(apiUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }

  function copyPayload() {
    void navigator.clipboard.writeText(SHORTCUT_PAYLOAD);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-8">
      <Link
        href={ROUTES.health}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex gap-1 -ml-2 px-2")}
      >
        <ArrowLeft className="h-4 w-4" />
        {t("health.title")}
      </Link>

      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-[22px] p-6"
        style={{
          background: "linear-gradient(140deg, #1B2207 0%, #121214 70%)",
          border: "1px solid rgba(255,255,255,0.14)",
        }}
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-[200px] w-[200px] rounded-full"
          style={{ background: "rgba(212,255,58,0.10)", filter: "blur(50px)" }}
        />
        <div className="relative">
          <span className="text-3xl">🍎</span>
          <h1 className="mt-2 text-[22px] font-bold text-white">{t("health.shortcutGuide.title")}</h1>
          <p className="mt-1 text-[13px]" style={{ color: "#9A9AA2" }}>{t("health.shortcutGuide.subtitle")}</p>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {STEPS.map(({ key, descKey, emoji }) => (
          <div
            key={key}
            className="rounded-[18px] p-4"
            style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl">{emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white">{t(`health.shortcutGuide.${key}` as "health.shortcutGuide.step1")}</p>
                <p className="mt-0.5 text-[13px]" style={{ color: "#9A9AA2" }}>
                  {t(`health.shortcutGuide.${descKey}` as "health.shortcutGuide.step1desc")}
                </p>
                {key === "step1" && (
                  <Link href={ROUTES.settings} className={cn(buttonVariants({ size: "sm", variant: "outline" }), "mt-3 inline-flex items-center")}>
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Settings → API Tokens
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* API URL copy box */}
      <div
        className="rounded-[18px] p-4"
        style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <p className="mb-2 text-[13px] font-semibold text-white">{t("health.shortcutGuide.apiUrl")}</p>
        <div className="flex items-center gap-2">
          <code
            className="min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-[12px]"
            style={{ background: "rgba(255,255,255,0.06)", color: "#D4FF3A" }}
          >
            {apiUrl}
          </code>
          <button
            type="button"
            onClick={copyUrl}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            {copiedUrl
              ? <Check className="h-4 w-4" style={{ color: "#30D158" }} />
              : <Copy className="h-4 w-4" style={{ color: "#9A9AA2" }} />
            }
          </button>
        </div>
      </div>

      {/* Shortcut JSON reference */}
      <div
        className="rounded-[18px] p-4"
        style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[13px] font-semibold text-white">JSON Payload Reference</p>
          <button
            type="button"
            onClick={copyPayload}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors"
            style={{ background: "rgba(255,255,255,0.06)", color: "#9A9AA2" }}
          >
            {copiedPayload
              ? <><Check className="h-3 w-3" style={{ color: "#30D158" }} /> {t("health.shortcutGuide.copied")}</>
              : <><Copy className="h-3 w-3" /> {t("health.shortcutGuide.copyUrl")}</>
            }
          </button>
        </div>
        <pre
          className="overflow-x-auto rounded-lg p-3 text-[11px] leading-relaxed"
          style={{ background: "rgba(255,255,255,0.04)", color: "#9A9AA2" }}
        >
          {SHORTCUT_PAYLOAD}
        </pre>
        <p className="mt-2 text-[11px]" style={{ color: "#5E5E66" }}>
          All fields are optional — send only what Apple Health provides.
          Use <code style={{ color: "#D4FF3A" }}>Authorization: Bearer ftp_yourtoken</code> header.
        </p>
      </div>

      {/* How to build the Shortcut */}
      <div
        className="rounded-[18px] p-4 space-y-3"
        style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <p className="font-semibold text-white">Shortcut Actions (in order)</p>
        {[
          { n: "1", action: "Find Health Samples → Calculate Statistics", detail: "Type: Steps · Today · Statistik: Summe → als Variable \"steps\" sichern" },
          { n: "2", action: "Find Health Samples → Calculate Statistics", detail: "Type: Resting Heart Rate · Today · Statistik: Durchschnitt → \"restingHeartRate\"" },
          { n: "3", action: "Find Health Samples → Calculate Statistics", detail: "Type: Heart Rate Variability · Today · Statistik: Durchschnitt → \"hrv\"" },
          { n: "4", action: "Find Health Samples → Calculate Statistics", detail: "Type: Sleep Analysis (Asleep) · letzte 24 h · Statistik: Summe der Dauer, in Stunden → \"sleepDuration\"" },
          { n: "5", action: "Find Health Samples → Calculate Statistics", detail: "Type: Active Energy Burned · Today · Statistik: Summe → \"activeCalories\"" },
          { n: "6", action: "Dictionary", detail: 'Keys: date (Aktuelles Datum, Format "YYYY-MM-DD"), steps, restingHeartRate, hrv, sleepDuration, activeCalories — Werte = Variablen aus Schritt 1–5. Felder ohne Daten einfach weglassen.' },
          { n: "7", action: "Get Contents of URL", detail: `URL: ${apiUrl}\nMethode: POST · Anfragetext: JSON (Dictionary aus Schritt 6)\nHeader: Authorization = Bearer [dein Token]` },
        ].map(({ n, action, detail }) => (
          <div key={n} className="flex gap-3">
            <span
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
              style={{ background: "#D4FF3A", color: "#0A1300" }}
            >
              {n}
            </span>
            <div>
              <p className="text-[13px] font-medium text-white">{action}</p>
              <p className="text-[11px]" style={{ color: "#9A9AA2" }}>{detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Done */}
      <div
        className="rounded-[18px] p-4 text-center"
        style={{ background: "rgba(212,255,58,0.06)", border: "1px solid rgba(212,255,58,0.2)" }}
      >
        <p className="text-[14px] font-semibold" style={{ color: "#D4FF3A" }}>✓ {t("health.shortcutGuide.done")}</p>
      </div>

      {/* HAE fallback note */}
      <p className="px-2 text-center text-[11px]" style={{ color: "#5E5E66" }}>
        Alternativ funktioniert weiterhin die App „Health Auto Export" (REST-API-Export an dieselbe URL) —
        der native Kurzbefehl oben kommt aber ohne Zusatz-App und ohne Kosten aus.
      </p>
    </div>
  );
}
