"use client";

import Link from "next/link";
import { Moon, Heart, Zap, Dumbbell, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n-provider";
import { ROUTES } from "@/lib/constants";
import type { RecoveryBreakdown } from "../recovery";


interface RecoveryRingProps {
  recovery: RecoveryBreakdown;
}

export function RecoveryRing({ recovery }: RecoveryRingProps) {
  const { t } = useI18n();
  const { score, level, sleepScore, hrScore, hrvScore, loadScore, trainingLoad } = recovery;

  if (level === "none") return null;

  const color =
    level === "high" ? "#D4FF3A"
    : level === "mid" ? "#FFB340"
    : "#FF453A";

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;

  const label =
    level === "high" ? t("health.recoveryHigh")
    : level === "mid" ? t("health.recoveryMid")
    : t("health.recoveryLow");

  const daysAgo = trainingLoad.daysSinceLast;
  const lastTrainingLabel =
    daysAgo == null ? null
    : daysAgo === 0 ? "Heute trainiert"
    : daysAgo === 1 ? "Gestern trainiert"
    : `Vor ${daysAgo} Tagen trainiert`;

  return (
    <Link
      href={`${ROUTES.health}/recovery`}
      className="block space-y-3 rounded-[22px] p-5 transition-colors active:bg-white/5"
      style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center gap-4">
        {/* Ring */}
        <div className="relative shrink-0">
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle
              cx="50" cy="50" r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="8"
            />
            <circle
              cx="50" cy="50" r={radius}
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={circumference / 4}
              style={{ transition: "stroke-dasharray 0.8s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[22px] font-bold leading-none text-white">{score}</span>
            <span className="text-[10px] font-medium" style={{ color: "#9A9AA2" }}>/100</span>
          </div>
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#9A9AA2" }}>
            {t("health.recoveryScore")}
          </p>
          <p className="mt-0.5 text-[15px] font-semibold" style={{ color }}>
            {level === "high" ? "Ready to Train" : level === "mid" ? "Moderate" : "Rest Day"}
          </p>
          <p className="mt-1 text-[12px] leading-snug" style={{ color: "#9A9AA2" }}>
            {label}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "#5E5E66" }} />
      </div>

      {/* Sub-scores */}
      <div className="grid grid-cols-4 gap-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <SubScore icon={<Moon className="h-3 w-3" />} label="Schlaf" value={sleepScore} accent="#6E5BFF" />
        <SubScore icon={<Heart className="h-3 w-3" />} label="HR" value={hrScore} accent="#FF453A" />
        <SubScore icon={<Zap className="h-3 w-3" />} label="HRV" value={hrvScore} accent="#30D158" />
        <SubScore icon={<Dumbbell className="h-3 w-3" />} label="Last" value={loadScore} accent="#FFB340" />
      </div>

      {/* Training load chip */}
      {lastTrainingLabel && (
        <div
          className="flex items-center gap-1.5 rounded-full px-3 py-1 w-fit text-[11px] font-medium"
          style={{ background: "rgba(255,255,255,0.06)", color: "#9A9AA2" }}
        >
          <Dumbbell className="h-3 w-3" />
          {lastTrainingLabel}
          {trainingLoad.intensity && (
            <span style={{ color: trainingLoad.intensity === "high" ? "#FF453A" : trainingLoad.intensity === "low" ? "#30D158" : "#FFB340" }}>
              · {trainingLoad.intensity === "high" ? "intensiv" : trainingLoad.intensity === "low" ? "leicht" : "mittel"}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

function SubScore({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number | null; accent: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span style={{ color: accent }}>{icon}</span>
      <span className="text-[10px] uppercase tracking-wide" style={{ color: "#5E5E66" }}>{label}</span>
      <span className="text-[13px] font-semibold text-white">
        {value != null ? Math.round(value) : "—"}
      </span>
    </div>
  );
}
