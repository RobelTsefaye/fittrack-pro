"use client";

import { RequireAuth } from "@/components/auth/require-auth";
import { BackButton } from "@/components/layout/back-button";
import { NutritionPlanSection } from "@/features/settings/components/nutrition-plan-section";
import { useI18n } from "@/lib/i18n-provider";

export default function NutritionPlanSettingsPage() {
  const { t } = useI18n();
  return (
    <RequireAuth>
      <BackButton href="/settings" />
      <div className="space-y-5">
        <h1 className="page-title">{t("health.nutritionPlan.title")}</h1>
        <NutritionPlanSection />
      </div>
    </RequireAuth>
  );
}
