"use client";

import Link from "@/components/app-link";
import { ChevronRight, HeartPulse } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n-provider";
import { cn } from "@/lib/utils";

export type DashboardRecovery = { score: number; level: "high" | "mid" | "low" | "none" };

const TONE = {
  high: { text: "text-primary", ring: "ring-primary/30", key: "dashboard.recoveryHigh" },
  mid: { text: "text-amber-400", ring: "ring-amber-400/30", key: "dashboard.recoveryMid" },
  low: { text: "text-red-400", ring: "ring-red-400/40", key: "dashboard.recoveryLow" },
} as const;

/** One-line training readiness from the recovery score, linking to details. */
export function RecoveryHint({ recovery }: { recovery: DashboardRecovery }) {
  const { t } = useI18n();
  if (recovery.level === "none") return null;
  const tone = TONE[recovery.level];
  return (
    <Link
      href={`${ROUTES.health}/recovery`}
      data-glass
      className={cn("flex items-center gap-3 rounded-[16px] px-4 py-3 ring-1", tone.ring)}
    >
      <HeartPulse className={cn("h-5 w-5 shrink-0", tone.text)} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13px] font-semibold tabular-nums", tone.text)}>
          {t("dashboard.recoveryLabel", { score: recovery.score })}
        </p>
        <p className="text-[13px] text-[var(--sys-label2)]">{t(tone.key)}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--sys-label3)]" />
    </Link>
  );
}
