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
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("settings.name")}</span>
            <span className="font-medium">{name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("settings.email")}</span>
            <span className="font-medium">{email}</span>
          </div>
        </CardContent>
      </Card>

      <ApiTokensCard />

      <SettingsForm initial={initial} />
    </div>
  );
}
