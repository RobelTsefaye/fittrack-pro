"use client";
import { RequireAuth } from "@/components/auth/require-auth";
import { BackButton } from "@/components/layout/back-button";
import { CalendarSettingsSection } from "@/features/settings/components/calendar-settings-section";
import { useI18n } from "@/lib/i18n-provider";
export default function CardioSettingsPage() { const { t } = useI18n(); return <RequireAuth><BackButton href="/settings" /><div className="space-y-5"><h1 className="page-title">{t("settings.cardioDaysTitle")}</h1><CalendarSettingsSection kind="cardio" /></div></RequireAuth>; }
