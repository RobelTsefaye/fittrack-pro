"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Moon, Heart, Footprints, Flame, Wind,
  Droplets, Zap, Timer, RefreshCw,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-provider";
import { ROUTES } from "@/lib/constants";
import { type HealthSnapshot, calcRecoveryScore, formatSleepDuration } from "../types";
import { HealthStatPill } from "./health-stat-pill";
import { RecoveryRing } from "./recovery-ring";
import { HealthMetricChart } from "./health-metric-chart";

type TrendDays = 7 | 30;

export function HealthDashboard() {
  const { t } = useI18n();
  const [snapshots, setSnapshots] = useState<HealthSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [trend, setTrend] = useState<TrendDays>(7);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/health-data?limit=30", { credentials: "include" });
      if (res.ok) {
        const json = (await res.json()) as { data: HealthSnapshot[] };
        setSnapshots(json.data);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const today = snapshots.at(-1) ?? null;
  const recovery = today ? calcRecoveryScore(today) : null;

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-[18px] bg-white/5" />
        ))}
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-4 rounded-[22px] p-8 text-center"
        style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <span className="text-4xl">🍎</span>
        <div>
          <p className="text-[16px] font-semibold text-white">{t("health.noData")}</p>
          <p className="mt-1 text-[13px]" style={{ color: "#9A9AA2" }}>{t("health.noDataHint")}</p>
        </div>
        <Link href={`${ROUTES.health}/shortcut`} className={buttonVariants({ size: "sm" }) + " mt-1"}>
          {t("health.setupShortcut")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">{t("health.title")}</h1>
          <p className="text-[13px]" style={{ color: "#9A9AA2" }}>{t("health.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="flex h-9 w-9 items-center justify-center rounded-full transition-colors"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            style={{ color: "#9A9AA2" }}
          />
        </button>
      </div>

      {/* Recovery Ring */}
      {recovery && recovery.level !== "none" && (
        <RecoveryRing recovery={recovery} />
      )}

      {/* Today's Summary Grid */}
      {today && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#9A9AA2" }}>
            {t("health.todayTitle")}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <HealthStatPill
              icon={<Moon className="h-3.5 w-3.5" />}
              label={t("health.sleep")}
              value={today.sleepDuration != null ? formatSleepDuration(today.sleepDuration) : null}
              accent="#6E5BFF"
            />
            <HealthStatPill
              icon={<Heart className="h-3.5 w-3.5" />}
              label={t("health.restingHR")}
              value={today.restingHeartRate?.toString() ?? null}
              unit={today.restingHeartRate != null ? t("health.unit.bpm") : undefined}
              accent="#FF453A"
            />
            <HealthStatPill
              icon={<Footprints className="h-3.5 w-3.5" />}
              label={t("health.steps")}
              value={today.steps != null ? today.steps.toLocaleString() : null}
              accent="#D4FF3A"
            />
            <HealthStatPill
              icon={<Flame className="h-3.5 w-3.5" />}
              label={t("health.activeCalories")}
              value={today.activeCalories != null ? Math.round(today.activeCalories).toString() : null}
              unit={today.activeCalories != null ? t("health.unit.kcal") : undefined}
              accent="#FF9F0A"
            />
          </div>
        </div>
      )}

      {/* Extra stats */}
      {today && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <HealthStatPill
            icon={<Zap className="h-3.5 w-3.5" />}
            label={t("health.hrv")}
            value={today.hrv != null ? today.hrv.toFixed(0) : null}
            unit={today.hrv != null ? t("health.unit.ms") : undefined}
            accent="#30D158"
          />
          <HealthStatPill
            icon={<Timer className="h-3.5 w-3.5" />}
            label={t("health.exerciseMinutes")}
            value={today.exerciseMinutes?.toString() ?? null}
            unit={today.exerciseMinutes != null ? t("health.unit.minutes") : undefined}
            accent="#FFB340"
          />
          <HealthStatPill
            icon={<Wind className="h-3.5 w-3.5" />}
            label={t("health.vo2Max")}
            value={today.vo2Max != null ? today.vo2Max.toFixed(1) : null}
            unit={today.vo2Max != null ? t("health.unit.mlPerKgMin") : undefined}
            accent="#64D2FF"
          />
          <HealthStatPill
            icon={<Droplets className="h-3.5 w-3.5" />}
            label={t("health.water")}
            value={today.water != null ? (today.water / 1000).toFixed(1) : null}
            unit={today.water != null ? "L" : undefined}
            accent="#0A84FF"
          />
        </div>
      )}

      {/* Trend toggle */}
      <div className="flex gap-2">
        {([7, 30] as TrendDays[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setTrend(d)}
            className="rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors"
            style={
              trend === d
                ? { background: "#D4FF3A", color: "#0A1300" }
                : { background: "rgba(255,255,255,0.06)", color: "#9A9AA2" }
            }
          >
            {d === 7 ? t("health.trend7d") : t("health.trend30d")}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="space-y-3">
        <HealthMetricChart
          data={snapshots}
          metric="sleepDuration"
          label={t("health.sleep")}
          unit={t("health.unit.hours")}
          color="#6E5BFF"
          days={trend}
        />
        <HealthMetricChart
          data={snapshots}
          metric="restingHeartRate"
          label={t("health.restingHR")}
          unit={t("health.unit.bpm")}
          color="#FF453A"
          days={trend}
        />
        <HealthMetricChart
          data={snapshots}
          metric="hrv"
          label={t("health.hrv")}
          unit={t("health.unit.ms")}
          color="#30D158"
          days={trend}
        />
        <HealthMetricChart
          data={snapshots}
          metric="steps"
          label={t("health.steps")}
          color="#D4FF3A"
          days={trend}
        />
        <HealthMetricChart
          data={snapshots}
          metric="activeCalories"
          label={t("health.activeCalories")}
          unit={t("health.unit.kcal")}
          color="#FF9F0A"
          days={trend}
        />
        <HealthMetricChart
          data={snapshots}
          metric="vo2Max"
          label={t("health.vo2Max")}
          unit={t("health.unit.mlPerKgMin")}
          color="#64D2FF"
          days={trend}
        />
      </div>

      {/* Shortcut setup link */}
      <Link
        href={`${ROUTES.health}/shortcut`}
        className="flex items-center gap-3 rounded-[18px] p-4 transition-colors active:bg-white/5"
        style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          🍎
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-white">{t("health.shortcutGuide.title")}</p>
          <p className="text-[12px]" style={{ color: "#9A9AA2" }}>{t("health.shortcutGuide.subtitle")}</p>
        </div>
        <span style={{ color: "#5E5E66" }}>›</span>
      </Link>
    </div>
  );
}
