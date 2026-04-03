"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.title")}</h1>
        <p className="text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.profile")}</CardTitle>
          <CardDescription>{t("settings.profileDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
            <span className="shrink-0 text-muted-foreground">{t("settings.name")}</span>
            <span className="min-w-0 font-medium break-words text-right sm:text-right">{name}</span>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
            <span className="shrink-0 text-muted-foreground">{t("settings.email")}</span>
            <span className="min-w-0 break-all font-medium text-right sm:text-right">{email}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.crossDeviceTitle")}</CardTitle>
          <CardDescription>{t("settings.crossDeviceDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {process.env.NEXT_PUBLIC_APP_URL ? (
            <div>
              <p className="mb-1 font-medium text-foreground">{t("settings.crossDeviceUrlLabel")}</p>
              <code className="block break-all rounded-md bg-muted px-2 py-2 text-xs">
                {process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}
              </code>
            </div>
          ) : null}
          <p>{t("settings.crossDeviceHint")}</p>
          <p className="text-xs">{t("settings.crossDeviceOfflineNote")}</p>
        </CardContent>
      </Card>

      <ApiTokensCard />

      <SettingsForm initial={initial} />
    </div>
  );
}
