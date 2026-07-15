"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { syncTrainingCalendar } from "@/lib/native/calendar";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-provider";
import { CARDIO_CALENDAR_LABELS } from "@/features/calendar/cardio-labels";

type InitialSettings = {
  locale: "EN" | "DE";
  weightUnit: "KG" | "LB";
  theme: "LIGHT" | "DARK" | "SYSTEM";
  restTimerDefault: number;
  calendarSyncEnabled: boolean;
  trainingWeekdays: number[];
  trainingTimeMinutes: number;
  trainingDurationMinutes: number;
  cardioSyncEnabled: boolean;
  cardioWeekdays: number[];
  cardioTimeMinutes: number;
  cardioDurationMinutes: number;
  cardioLabel: string;
};

function themeToNext(theme: InitialSettings["theme"]): "light" | "dark" | "system" {
  if (theme === "LIGHT") return "light";
  if (theme === "DARK") return "dark";
  return "system";
}
function nextToTheme(v: string): InitialSettings["theme"] {
  if (v === "light") return "LIGHT";
  if (v === "dark") return "DARK";
  return "SYSTEM";
}

const selectClass =
  "appearance-none bg-transparent text-[0.9375rem] text-right text-[var(--sys-label2)] outline-none cursor-pointer pr-5";

const WEEKDAY_KEYS = ["weekdayMon", "weekdayTue", "weekdayWed", "weekdayThu", "weekdayFri", "weekdaySat", "weekdaySun"] as const;
function minutesToHHMM(min: number): string { return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`; }
function hhmmToMinutes(v: string): number { const [h, m] = v.split(":").map(Number); return Number.isNaN(h) || Number.isNaN(m) ? 1080 : h * 60 + m; }

export function SettingsForm({ initial }: { initial: InitialSettings }) {
  const { t } = useI18n();
  const { setTheme } = useTheme();
  const router = useRouter();

  const [locale, setLocale] = useState(initial.locale);
  const [weightUnit, setWeightUnit] = useState(initial.weightUnit);
  const [theme, setThemeState] = useState(initial.theme);
  const [restTimerDefault, setRestTimerDefault] = useState(String(initial.restTimerDefault));
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(initial.calendarSyncEnabled);
  const [trainingWeekdays, setTrainingWeekdays] = useState<number[]>(initial.trainingWeekdays);
  const [trainingTime, setTrainingTime] = useState(minutesToHHMM(initial.trainingTimeMinutes));
  const [trainingDuration, setTrainingDuration] = useState(String(initial.trainingDurationMinutes));
  const [cardioSyncEnabled, setCardioSyncEnabled] = useState(initial.cardioSyncEnabled);
  const [cardioWeekdays, setCardioWeekdays] = useState<number[]>(initial.cardioWeekdays);
  const [cardioTime, setCardioTime] = useState(minutesToHHMM(initial.cardioTimeMinutes));
  const [cardioDuration, setCardioDuration] = useState(String(initial.cardioDurationMinutes));
  const [cardioLabel, setCardioLabel] = useState(initial.cardioLabel);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<"ok" | "err" | null>(null);
  function toggleWeekday(i: number) { setTrainingWeekdays((prev) => prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort((a, b) => a - b)); }
  function toggleCardioWeekday(i: number) { setCardioWeekdays((prev) => prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort((a, b) => a - b)); }

  useEffect(() => { setTheme(themeToNext(initial.theme)); }, [initial.theme, setTheme]);

  async function save() {
    setMessage(null);
    const rest = parseInt(restTimerDefault, 10);
    const trainingDurationMinutes = parseInt(trainingDuration, 10);
    const cardioDurationMinutes = parseInt(cardioDuration, 10);
    if (Number.isNaN(rest) || rest < 30 || rest > 600 || Number.isNaN(trainingDurationMinutes) || trainingDurationMinutes < 1 || trainingDurationMinutes > 1439 || Number.isNaN(cardioDurationMinutes) || cardioDurationMinutes < 1 || cardioDurationMinutes > 1439) return;
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale, weightUnit, theme, restTimerDefault: rest, calendarSyncEnabled, trainingWeekdays, trainingTimeMinutes: hhmmToMinutes(trainingTime), trainingDurationMinutes, cardioSyncEnabled, cardioWeekdays, cardioTimeMinutes: hhmmToMinutes(cardioTime), cardioDurationMinutes, cardioLabel }),
    });
    setSaving(false);
    if (!res.ok) { setMessage("err"); return; }
    setTheme(themeToNext(theme));
    setMessage("ok");
    void syncTrainingCalendar();
    router.refresh();
  }

  // Trigger a client-side download of a blob. The object URL is revoked on a
  // timeout rather than synchronously after click(): revoking immediately can
  // invalidate the URL before the browser has actually started the download,
  // producing an empty/failed file (notably on Safari/iOS).
  function triggerBlobDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function downloadJson() {
    const res = await fetch("/api/export");
    if (!res.ok) return;
    const blob = await res.blob();
    triggerBlobDownload(blob, t("export.jsonFilename"));
  }

  async function downloadCsv() {
    const res = await fetch("/api/export/csv");
    if (!res.ok) return;
    const blob = await res.blob();
    triggerBlobDownload(blob, t("export.csvFilename"));
  }

  return (
    <div className="space-y-8">

      {/* ── Preferences ─────────────────────────────── */}
      <section className="space-y-2">
        <p className="ios-section-label">{t("settings.preferences")}</p>
        <div className="ios-group">

          {/* Language */}
          <label className="ios-row cursor-pointer">
            <span className="flex-1 text-[0.9375rem]">{t("settings.language")}</span>
            <div className="relative flex items-center">
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as "EN" | "DE")}
                className={selectClass}
              >
                <option value="EN">{t("settings.langEnglish")}</option>
                <option value="DE">{t("settings.langGerman")}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-[var(--sys-label3)]" />
            </div>
          </label>

          {/* Weight unit */}
          <label className="ios-row cursor-pointer">
            <span className="flex-1 text-[0.9375rem]">{t("settings.weightUnit")}</span>
            <div className="relative flex items-center">
              <select
                value={weightUnit}
                onChange={(e) => setWeightUnit(e.target.value as "KG" | "LB")}
                className={selectClass}
              >
                <option value="KG">kg</option>
                <option value="LB">lb</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-[var(--sys-label3)]" />
            </div>
          </label>

          {/* Theme */}
          <label className="ios-row cursor-pointer">
            <span className="flex-1 text-[0.9375rem]">{t("settings.theme")}</span>
            <div className="relative flex items-center">
              <select
                value={themeToNext(theme)}
                onChange={(e) => setThemeState(nextToTheme(e.target.value))}
                className={selectClass}
              >
                <option value="light">{t("settings.themeLight")}</option>
                <option value="dark">{t("settings.themeDark")}</option>
                <option value="system">{t("settings.themeSystem")}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-[var(--sys-label3)]" />
            </div>
          </label>

          {/* Rest timer */}
          <div className="ios-row">
            <span className="flex-1 text-[0.9375rem]">{t("settings.restTimer")}</span>
            <input
              type="number"
              min={30}
              max={600}
              step={5}
              value={restTimerDefault}
              onChange={(e) => setRestTimerDefault(e.target.value)}
              className="w-16 bg-transparent text-right text-[0.9375rem] text-[var(--sys-label2)] outline-none"
            />
            <span className="text-sm text-[var(--sys-label3)]">s</span>
          </div>
        </div>

        {/* Hint */}
        <p className="px-4 text-xs text-[var(--sys-label2)]">{t("settings.restTimerHint")}</p>
      </section>

      <section className="space-y-2">
        <p className="ios-section-label">{t("settings.trainingDaysTitle")}</p>
        <div className="ios-group">
          <label className="ios-row cursor-pointer"><span className="flex-1 text-[0.9375rem]">{t("settings.calendarSyncToggle")}</span><input type="checkbox" checked={calendarSyncEnabled} onChange={(e) => setCalendarSyncEnabled(e.target.checked)} className="h-5 w-5 accent-primary" /></label>
          <div className="ios-row"><span className="flex-1 text-[0.9375rem]">{t("settings.trainingDaysLabel")}</span><div className="flex gap-1.5">{WEEKDAY_KEYS.map((key, i) => <button key={key} type="button" onClick={() => toggleWeekday(i)} className={`h-8 w-8 rounded-full text-xs font-medium transition-colors ${trainingWeekdays.includes(i) ? "bg-primary text-primary-foreground" : "bg-[var(--sys-fill)] text-[var(--sys-label2)]"}`}>{t(`settings.${key}`)}</button>)}</div></div>
          <div className="ios-row"><span className="flex-1 text-[0.9375rem]">{t("settings.trainingTime")}</span><input type="time" value={trainingTime} onChange={(e) => setTrainingTime(e.target.value)} className="bg-transparent text-right text-[0.9375rem] text-[var(--sys-label2)] outline-none" /></div>
          <div className="ios-row"><span className="flex-1 text-[0.9375rem]">{t("settings.trainingDuration")}</span><input type="number" min={1} max={1439} value={trainingDuration} onChange={(e) => setTrainingDuration(e.target.value)} className="w-16 bg-transparent text-right text-[0.9375rem] text-[var(--sys-label2)] outline-none" /><span className="text-sm text-[var(--sys-label3)]">min</span></div>
          <button type="button" onClick={() => router.push("/settings/calendar?kind=training")} className="ios-row w-full text-left"><span className="flex-1 text-[0.9375rem]">{t("settings.editDays")}</span><ChevronRight className="h-4 w-4 text-[var(--sys-label3)]" /></button>
        </div>
        <p className="px-4 text-xs text-[var(--sys-label2)]">{Capacitor.isNativePlatform() ? t("settings.calendarHint") : t("settings.calendarWebHint")}</p>
      </section>

      <section className="space-y-2">
        <p className="ios-section-label">{t("settings.cardioDaysTitle")}</p>
        <div className="ios-group">
          <label className="ios-row cursor-pointer"><span className="flex-1 text-[0.9375rem]">{t("settings.cardioSyncToggle")}</span><input type="checkbox" checked={cardioSyncEnabled} onChange={(e) => setCardioSyncEnabled(e.target.checked)} className="h-5 w-5 accent-primary" /></label>
          <div className="ios-row"><span className="flex-1 text-[0.9375rem]">{t("settings.trainingDaysLabel")}</span><div className="flex gap-1.5">{WEEKDAY_KEYS.map((key, i) => <button key={key} type="button" onClick={() => toggleCardioWeekday(i)} className={`h-8 w-8 rounded-full text-xs font-medium transition-colors ${cardioWeekdays.includes(i) ? "bg-primary text-primary-foreground" : "bg-[var(--sys-fill)] text-[var(--sys-label2)]"}`}>{t(`settings.${key}`)}</button>)}</div></div>
          <div className="ios-row"><span className="flex-1 text-[0.9375rem]">{t("settings.cardioTime")}</span><input type="time" value={cardioTime} onChange={(e) => setCardioTime(e.target.value)} className="bg-transparent text-right text-[0.9375rem] text-[var(--sys-label2)] outline-none" /></div>
          <div className="ios-row"><span className="flex-1 text-[0.9375rem]">{t("settings.cardioDuration")}</span><input type="number" min={1} max={1439} value={cardioDuration} onChange={(e) => setCardioDuration(e.target.value)} className="w-16 bg-transparent text-right text-[0.9375rem] text-[var(--sys-label2)] outline-none" /><span className="text-sm text-[var(--sys-label3)]">min</span></div>
          <label className="ios-row cursor-pointer"><span className="flex-1 text-[0.9375rem]">{t("settings.cardioLabelLabel")}</span><div className="relative flex items-center"><select value={cardioLabel} onChange={(e) => setCardioLabel(e.target.value)} className={selectClass}>{CARDIO_CALENDAR_LABELS.map((label) => <option key={label || "cardio"} value={label}>{label || "Cardio"}</option>)}</select><ChevronDown className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-[var(--sys-label3)]" /></div></label>
          <button type="button" onClick={() => router.push("/settings/calendar?kind=cardio")} className="ios-row w-full text-left"><span className="flex-1 text-[0.9375rem]">{t("settings.editDays")}</span><ChevronRight className="h-4 w-4 text-[var(--sys-label3)]" /></button>
        </div>
        <p className="px-4 text-xs text-[var(--sys-label2)]">{Capacitor.isNativePlatform() ? t("settings.cardioHint") : t("settings.cardioWebHint")}</p>
      </section>

      {/* Save button + feedback */}
      <div className="space-y-2">
        <Button type="button" size="lg" className="w-full" onClick={save} disabled={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </Button>
        {message === "ok" && (
          <p className="text-center text-sm text-green-600 dark:text-green-500">{t("settings.saved")}</p>
        )}
        {message === "err" && (
          <p className="text-center text-sm text-destructive">{t("settings.saveFailed")}</p>
        )}
      </div>

      {/* ── Export ──────────────────────────────────── */}
      <section className="space-y-2">
        <p className="ios-section-label">{t("settings.exportTitle")}</p>
        <div className="ios-group">
          <button
            type="button"
            onClick={downloadJson}
            className="ios-row w-full cursor-pointer hover:bg-[var(--nav-hover-bg)] transition-colors"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Download className="h-4 w-4 text-primary" />
            </div>
            <span className="flex-1 text-[0.9375rem]">{t("settings.exportJson")}</span>
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            className="ios-row w-full cursor-pointer hover:bg-[var(--nav-hover-bg)] transition-colors"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Download className="h-4 w-4 text-primary" />
            </div>
            <span className="flex-1 text-[0.9375rem]">{t("settings.exportCsv")}</span>
          </button>
        </div>
        <p className="px-4 text-xs text-[var(--sys-label2)]">{t("settings.exportDesc")}</p>
      </section>
    </div>
  );
}
