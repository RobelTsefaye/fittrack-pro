"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTheme } from "next-themes";
import { RequireAuth } from "@/components/auth/require-auth";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { useI18n } from "@/lib/i18n-provider";
import { DEFAULT_SETTINGS, type InitialSettings } from "@/features/settings/types";

const selectClass = "appearance-none bg-transparent text-right text-[0.9375rem] text-[var(--sys-label2)] outline-none cursor-pointer pr-5";
export default function PreferencesPage() {
  const { t } = useI18n(); const { setTheme } = useTheme(); const [settings, setSettings] = useState<InitialSettings>(DEFAULT_SETTINGS); const [saving, setSaving] = useState(false);
  useEffect(() => { void authenticatedFetch("/api/settings", { credentials: "include" }).then((r) => r.ok ? r.json() : null).then((json) => json?.data && setSettings(json.data)).catch(() => {}); }, []);
  async function save() { setSaving(true); const result = await authenticatedFetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ locale: settings.locale, weightUnit: settings.weightUnit, theme: settings.theme, restTimerDefault: settings.restTimerDefault }) }); setSaving(false); if (result.ok) setTheme(settings.theme.toLowerCase()); }
  return <RequireAuth><BackButton href="/settings" /><div className="space-y-5"><h1 className="page-title">{t("settings.preferences")}</h1><div className="ios-group"><label className="ios-row" htmlFor="settings-locale"><span className="flex-1">{t("settings.language")}</span><span className="relative"><select id="settings-locale" value={settings.locale} onChange={(e) => setSettings({ ...settings, locale: e.target.value as InitialSettings["locale"] })} className={selectClass}><option value="EN">{t("settings.langEnglish")}</option><option value="DE">{t("settings.langGerman")}</option></select><ChevronDown className="pointer-events-none absolute right-0 top-1 h-3.5 w-3.5 text-[var(--sys-label3)]" /></span></label><label className="ios-row" htmlFor="settings-weight"><span className="flex-1">{t("settings.weightUnit")}</span><select id="settings-weight" value={settings.weightUnit} onChange={(e) => setSettings({ ...settings, weightUnit: e.target.value as InitialSettings["weightUnit"] })} className={selectClass}><option value="KG">kg</option><option value="LB">lb</option></select></label><label className="ios-row" htmlFor="settings-theme"><span className="flex-1">{t("settings.theme")}</span><select id="settings-theme" value={settings.theme} onChange={(e) => setSettings({ ...settings, theme: e.target.value as InitialSettings["theme"] })} className={selectClass}><option value="LIGHT">{t("settings.themeLight")}</option><option value="DARK">{t("settings.themeDark")}</option><option value="SYSTEM">{t("settings.themeSystem")}</option></select></label><label className="ios-row" htmlFor="settings-rest"><span className="flex-1">{t("settings.restTimer")}</span><input id="settings-rest" type="number" min={30} max={600} value={settings.restTimerDefault} onChange={(e) => setSettings({ ...settings, restTimerDefault: Number(e.target.value) })} className="w-16 bg-transparent text-right text-[0.9375rem] text-[var(--sys-label2)] outline-none" /><span className="text-sm text-[var(--sys-label3)]">s</span></label></div><p className="ios-section-footer">{t("settings.restTimerHint")}</p><Button className="w-full" size="lg" onClick={save} disabled={saving}>{saving ? t("common.saving") : t("common.save")}</Button></div></RequireAuth>;
}
