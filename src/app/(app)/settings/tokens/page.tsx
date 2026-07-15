"use client";
import { RequireAuth } from "@/components/auth/require-auth";
import { BackButton } from "@/components/layout/back-button";
import { ApiTokensCard } from "@/features/settings/components/api-keys-card";
import { useI18n } from "@/lib/i18n-provider";
export default function TokenSettingsPage() { const { t } = useI18n(); return <RequireAuth><BackButton href="/settings" /><div className="space-y-5"><div><h1 className="page-title">{t("settings.apiTokensTitle")}</h1><p className="mt-0.5 text-sm text-[var(--sys-label2)]">{t("settings.apiTokensDesc")}</p></div><ApiTokensCard /></div></RequireAuth>; }
