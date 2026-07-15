"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { CalendarDays, Download, HeartPulse, KeyRound, Settings2 } from "lucide-react";
import { RequireAuth } from "@/components/auth/require-auth";
import { BackButton } from "@/components/layout/back-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { loadCachedUser } from "@/lib/cached-user";
import { useI18n } from "@/lib/i18n-provider";
import { SettingsRow } from "@/features/settings/components/settings-row";

export default function SettingsPage() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const [cachedUser] = useState(() => typeof window === "undefined" ? {} : loadCachedUser());
  const name = session?.user?.name ?? cachedUser.name ?? null;
  const email = session?.user?.email ?? cachedUser.email ?? null;
  const initials = name?.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2) ?? "?";

  return <RequireAuth><BackButton /><div className="space-y-5"><div><h1 className="page-title">{t("settings.title")}</h1><p className="mt-0.5 text-sm text-[var(--sys-label2)]">{t("settings.subtitle")}</p></div><div className="ios-group"><div className="ios-row py-4"><Avatar className="h-11 w-11 shrink-0"><AvatarFallback className="bg-primary/10 text-[0.7rem] font-semibold text-primary">{initials}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-[0.9375rem] font-semibold">{name ?? "—"}</p><p className="truncate text-[0.8125rem] text-[var(--sys-label2)]">{email ?? ""}</p></div></div></div><div className="ios-group"><SettingsRow href="/settings/preferences" icon={Settings2} label={t("settings.menuPreferences")} /><SettingsRow href="/settings/training" icon={CalendarDays} label={t("settings.menuTraining")} /><SettingsRow href="/settings/cardio" icon={HeartPulse} label={t("settings.menuCardio")} /><SettingsRow href="/settings/tokens" icon={KeyRound} label={t("settings.menuTokens")} /><SettingsRow href="/settings/export" icon={Download} label={t("settings.menuExport")} /></div><p className="ios-section-footer">{t("settings.crossDeviceDesc")}</p></div></RequireAuth>;
}
