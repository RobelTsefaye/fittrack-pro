"use client";

import { useState } from "react";
import { Scale, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";
import { BodyWeightTracker } from "./body-weight-tracker";
import { BodyMeasurementsTracker } from "./body-measurements-tracker";
import { useI18n } from "@/lib/i18n-provider";

const TABS = [
  { id: "weight",       labelKey: "bodyTracking.tabWeight",       icon: Scale },
  { id: "measurements", labelKey: "bodyTracking.tabMeasurements", icon: Ruler },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface BodyTrackingShellProps {
  weightUnit: "KG" | "LB";
}

export function BodyTrackingShell({ weightUnit }: BodyTrackingShellProps) {
  const { t } = useI18n();
  const [active, setActive] = useState<TabId>("weight");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("bodyTracking.title")}</h1>
        <p className="text-sm text-[var(--sys-label2)] mt-0.5">
          {t("bodyTracking.subtitle")}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex rounded-xl overflow-hidden border border-[var(--sys-separator)]">
        {TABS.map(({ id, labelKey, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActive(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors",
              active === id
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-[var(--sys-label2)] hover:bg-[var(--sys-fill)]"
            )}
          >
            <Icon className="h-4 w-4" />
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {active === "weight" && <BodyWeightTracker weightUnit={weightUnit} />}
      {active === "measurements" && <BodyMeasurementsTracker />}
    </div>
  );
}
