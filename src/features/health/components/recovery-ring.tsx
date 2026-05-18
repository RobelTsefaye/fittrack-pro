"use client";

import { type RecoveryScore } from "../types";
import { useI18n } from "@/lib/i18n-provider";

interface RecoveryRingProps {
  recovery: RecoveryScore;
}

export function RecoveryRing({ recovery }: RecoveryRingProps) {
  const { t } = useI18n();
  const { score, level } = recovery;

  const color =
    level === "high" ? "#D4FF3A"
    : level === "mid" ? "#FFB340"
    : level === "low" ? "#FF453A"
    : "#5E5E66";

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;

  const label =
    level === "high" ? t("health.recoveryHigh")
    : level === "mid" ? t("health.recoveryMid")
    : level === "low" ? t("health.recoveryLow")
    : "—";

  if (level === "none") return null;

  return (
    <div
      className="flex items-center gap-4 rounded-[22px] p-5"
      style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      {/* Ring */}
      <div className="relative shrink-0">
        <svg width="100" height="100" viewBox="0 0 100 100">
          {/* Background track */}
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="8"
          />
          {/* Progress arc */}
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
        {/* Score in center */}
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
    </div>
  );
}
