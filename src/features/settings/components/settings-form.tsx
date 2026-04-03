"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n-provider";

type InitialSettings = {
  locale: "EN" | "DE";
  weightUnit: "KG" | "LB";
  theme: "LIGHT" | "DARK" | "SYSTEM";
  restTimerDefault: number;
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

export function SettingsForm({ initial }: { initial: InitialSettings }) {
  const { t } = useI18n();
  const { setTheme } = useTheme();
  const router = useRouter();

  const [locale, setLocale] = useState(initial.locale);
  const [weightUnit, setWeightUnit] = useState(initial.weightUnit);
  const [theme, setThemeState] = useState(initial.theme);
  const [restTimerDefault, setRestTimerDefault] = useState(String(initial.restTimerDefault));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<"ok" | "err" | null>(null);

  useEffect(() => {
    setTheme(themeToNext(initial.theme));
  }, [initial.theme, setTheme]);

  async function save() {
    setMessage(null);
    const rest = parseInt(restTimerDefault, 10);
    if (Number.isNaN(rest) || rest < 30 || rest > 600) return;

    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locale,
        weightUnit,
        theme,
        restTimerDefault: rest,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      setMessage("err");
      return;
    }

    setTheme(themeToNext(theme));
    setMessage("ok");
    router.refresh();
  }

  async function downloadJson() {
    const res = await fetch("/api/export");
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = t("export.jsonFilename");
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadCsv() {
    const res = await fetch("/api/export/csv");
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = t("export.csvFilename");
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.preferences")}</CardTitle>
          <CardDescription>{t("settings.preferencesDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>{t("settings.language")}</Label>
            <p className="text-xs text-muted-foreground">{t("settings.languageDesc")}</p>
            <select
              className="flex h-9 w-full max-w-xs rounded-lg border border-input bg-transparent px-3 text-sm"
              value={locale}
              onChange={(e) => setLocale(e.target.value as "EN" | "DE")}
            >
              <option value="EN">{t("settings.langEnglish")}</option>
              <option value="DE">{t("settings.langGerman")}</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label>{t("settings.weightUnit")}</Label>
            <select
              className="flex h-9 w-full max-w-xs rounded-lg border border-input bg-transparent px-3 text-sm"
              value={weightUnit}
              onChange={(e) => setWeightUnit(e.target.value as "KG" | "LB")}
            >
              <option value="KG">kg</option>
              <option value="LB">lb</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label>{t("settings.theme")}</Label>
            <select
              className="flex h-9 w-full max-w-xs rounded-lg border border-input bg-transparent px-3 text-sm"
              value={themeToNext(theme)}
              onChange={(e) => setThemeState(nextToTheme(e.target.value))}
            >
              <option value="light">{t("settings.themeLight")}</option>
              <option value="dark">{t("settings.themeDark")}</option>
              <option value="system">{t("settings.themeSystem")}</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label>{t("settings.restTimer")}</Label>
            <p className="text-xs text-muted-foreground">{t("settings.restTimerHint")}</p>
            <Input
              type="number"
              min={30}
              max={600}
              step={5}
              className="max-w-xs"
              value={restTimerDefault}
              onChange={(e) => setRestTimerDefault(e.target.value)}
            />
          </div>

          {message === "ok" ? (
            <p className="text-sm text-green-600 dark:text-green-500">{t("settings.saved")}</p>
          ) : null}
          {message === "err" ? (
            <p className="text-sm text-destructive">{t("settings.saveFailed")}</p>
          ) : null}

          <Button type="button" onClick={save} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.exportTitle")}</CardTitle>
          <CardDescription>{t("settings.exportDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={downloadJson}>
            {t("settings.exportJson")}
          </Button>
          <Button type="button" variant="outline" onClick={downloadCsv}>
            {t("settings.exportCsv")}
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
