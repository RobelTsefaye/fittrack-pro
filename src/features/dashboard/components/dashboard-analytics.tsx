"use client";

import { useMemo } from "react";
import { Dumbbell, Flame, Trophy, TrendingUp } from "lucide-react";
import type { DashboardClientPayload } from "@/features/dashboard/queries";
import { useI18n } from "@/lib/i18n-provider";
import { NextWorkoutCard } from "./next-workout-card";

const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function VolumeSparkline({ data }: { data: { volume: number; label: string }[] }) {
  const filtered = data.slice(-8);
  if (filtered.length < 2) return null;

  const max = Math.max(...filtered.map((d) => d.volume), 1);
  const W = 320;
  const H = 80;

  const pts = filtered.map((d, i) => [
    (i / (filtered.length - 1)) * W,
    H - (d.volume / max) * H * 0.85 - 4,
  ]);

  const linePath = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const fillPath = `${linePath} L${W} ${H} L0 ${H} Z`;

  const labelIndices = [0, Math.floor(filtered.length / 2), filtered.length - 1];

  return (
    <div
      className="rounded-[16px] p-4"
      style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="mb-2 flex items-baseline justify-between px-0.5">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: "#5E5E66" }}
        >
          Volume · 8 Wochen
        </span>
        <span className="text-[11px] font-semibold" style={{ color: "#D4FF3A" }}>
          ↑
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        className="overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id="vol-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#D4FF3A" stopOpacity="0.35" />
            <stop offset="1" stopColor="#D4FF3A" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fillPath} fill="url(#vol-grad)" />
        <path d={linePath} fill="none" stroke="#D4FF3A" strokeWidth="2" />
        {pts.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={i === pts.length - 1 ? 4 : 2}
            fill="#D4FF3A"
          />
        ))}
      </svg>
      <div
        className="mt-2 flex justify-between px-0.5 text-[10px]"
        style={{ color: "#5E5E66", fontVariantNumeric: "tabular-nums" }}
      >
        {filtered.map((d, i) =>
          labelIndices.includes(i) ? (
            <span key={d.label}>{d.label}</span>
          ) : null
        )}
      </div>
    </div>
  );
}

interface DashboardAnalyticsProps {
  userName?: string | null;
  weightUnit: "KG" | "LB";
  payload: DashboardClientPayload;
}

export function DashboardAnalytics({
  userName,
  weightUnit,
  payload,
}: DashboardAnalyticsProps) {
  const { t } = useI18n();
  const { summary, nextSession, volumeWeekly, recentPRs } = payload;

  const dayName = useMemo(
    () => new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(new Date()),
    []
  );
  const dateStr = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        month: "long",
        day: "numeric",
      }).format(new Date()),
    []
  );

  const statCards = useMemo(
    () => [
      {
        label: t("dashboard.thisWeek"),
        value: nf.format(summary.completedThisWeek),
        sub: `/ ${nf.format(summary.totalWorkouts)} ${t("dashboard.completed")}`,
        icon: Dumbbell,
        accent: false,
      },
      {
        label: t("dashboard.streak"),
        value: nf.format(summary.workoutStreakDays),
        sub: t("dashboard.streakHint"),
        icon: Flame,
        accent: true,
      },
      {
        label: "Volume",
        value: nf.format(
          Math.round(((volumeWeekly.at(-1)?.volume ?? 0) / 1000) * 10) / 10
        ),
        sub: "k kg",
        icon: TrendingUp,
        accent: false,
      },
      {
        label: t("dashboard.personalRecords"),
        value: nf.format(summary.personalRecordsCount),
        sub: t("dashboard.prHint"),
        icon: Trophy,
        accent: true,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      summary.completedThisWeek,
      summary.totalWorkouts,
      summary.workoutStreakDays,
      summary.personalRecordsCount,
      volumeWeekly,
    ]
  );

  const initials = (userName?.[0] ?? "A").toUpperCase();

  return (
    <div className="space-y-5">
      {/* ── Page header ─────────────────────── */}
      <div className="flex items-end justify-between px-0.5">
        <div>
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "#5E5E66" }}
          >
            {dayName} · {dateStr}
          </p>
          <h1 className="mt-1 text-[30px] font-bold leading-[1.05] tracking-[-0.02em] text-white">
            Hi, {userName?.split(" ")[0] || "Athlet"}
          </h1>
        </div>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
          style={{ background: "#26262B", color: "#F4F4F6" }}
        >
          {initials}
        </div>
      </div>

      {/* ── Up next card ────────────────────── */}
      <NextWorkoutCard nextSession={nextSession} />

      {/* ── Stats 2×2 grid ──────────────────── */}
      <div>
        <p
          className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: "#5E5E66" }}
        >
          {t("dashboard.thisWeek")}
        </p>
        <div className="stagger-children grid grid-cols-2 gap-2">
          {statCards.map((s) => (
            <div
              key={s.label}
              className="rounded-[16px] p-[14px]"
              style={{
                background: "#121214",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span
                  className="text-[11px] font-semibold uppercase tracking-[0.04em]"
                  style={{ color: "#5E5E66" }}
                >
                  {s.label}
                </span>
                <s.icon
                  className="h-4 w-4"
                  style={{ color: s.accent ? "#D4FF3A" : "#5E5E66" }}
                  strokeWidth={1.7}
                />
              </div>
              <div
                className="font-display text-[2rem] font-bold leading-none tracking-tight"
                style={{ color: s.accent ? "#D4FF3A" : "#F4F4F6" }}
              >
                {s.value}
              </div>
              <p className="mt-1 text-[11px] leading-tight" style={{ color: "#5E5E66" }}>
                {s.sub}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Volume sparkline ────────────────── */}
      {volumeWeekly.length >= 2 && <VolumeSparkline data={volumeWeekly} />}

      {/* ── Recent PRs ──────────────────────── */}
      {recentPRs.length > 0 && (
        <div>
          <p
            className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: "#5E5E66" }}
          >
            {t("dashboard.recentPrs")}
          </p>
          <div
            className="overflow-hidden rounded-[16px]"
            style={{
              background: "#121214",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {recentPRs.slice(0, 3).map((pr, i) => (
              <div
                key={pr.id}
                className="flex items-center gap-3 px-[14px] py-3"
                style={{
                  borderTop:
                    i > 0 ? "1px solid rgba(255,255,255,0.08)" : "none",
                }}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                  style={{ background: "rgba(212,255,58,0.14)" }}
                >
                  <Trophy
                    className="h-4 w-4"
                    style={{ color: "#D4FF3A" }}
                    strokeWidth={1.7}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-white">
                    {pr.exercise.name}
                  </p>
                  <p className="text-[12px]" style={{ color: "#5E5E66" }}>
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                    }).format(new Date(pr.achievedAt))}
                  </p>
                </div>
                <span
                  className="font-display text-[18px] font-bold tabular-nums"
                  style={{ color: "#D4FF3A" }}
                >
                  {pr.weight}
                  <span
                    className="text-[12px] font-normal"
                    style={{ color: "#5E5E66" }}
                  >
                    {" "}
                    {weightUnit.toLowerCase()} × {pr.reps}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {summary.totalWorkouts === 0 && (
        <div
          className="rounded-[16px] p-6 text-center"
          style={{
            background: "#121214",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <p className="text-[15px] font-semibold text-white">
            {t("dashboard.gettingStarted")}
          </p>
          <p className="mt-1 text-[13px]" style={{ color: "#5E5E66" }}>
            {t("dashboard.gettingStartedIntro")}
          </p>
        </div>
      )}
    </div>
  );
}
