"use client";

import { FileJson, Table2 } from "lucide-react";
import { RequireAuth } from "@/components/auth/require-auth";
import { BackButton } from "@/components/layout/back-button";
import { SettingsRow } from "@/features/settings/components/settings-row";
import { useI18n } from "@/lib/i18n-provider";

export default function ExportSettingsPage() {
  const { t } = useI18n();
  async function download(path: string, filename: string) { const res = await fetch(path); if (!res.ok) return; const url = URL.createObjectURL(await res.blob()); const link = document.createElement("a"); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10_000); }
  return <RequireAuth><BackButton href="/settings" /><div className="space-y-5"><div><h1 className="page-title">{t("settings.exportTitle")}</h1><p className="mt-0.5 text-sm text-[var(--sys-label2)]">{t("settings.exportDesc")}</p></div><div className="ios-group"><SettingsRow icon={FileJson} label={t("settings.exportJson")} onClick={() => void download("/api/export", t("export.jsonFilename"))} /><SettingsRow icon={Table2} label={t("settings.exportCsv")} onClick={() => void download("/api/export/csv", t("export.csvFilename"))} /></div></div></RequireAuth>;
}
