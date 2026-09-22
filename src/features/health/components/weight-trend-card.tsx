"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { loadHealthCache, saveHealthCache } from "@/lib/offline/screen-caches";
import { useI18n } from "@/lib/i18n-provider";

type NutritionPhase = "CUT" | "REVERSE_DIET" | "MAINTENANCE" | "BULK";

type TrendSuggestion = {
  kind: "bump_calories" | "reduce_calories";
  reasonKey: string;
  proposedWeeklyCalorieStep: number;
  proposedStartCalories: number;
};

type RawWeightPoint = { date: string; weightKg: number };

type PeriodSummary = {
  days: number;
  avgWeightKg: number | null;
  deltaKg: number | null;
  deltaPerWeekKg: number | null;
  count: number;
};

type WeightTrendResult = {
  points: { date: string; rolling7d: number | null }[];
  rawPoints: RawWeightPoint[];
  period: PeriodSummary;
  phase: NutritionPhase | null;
  thisWeekAvg: number | null;
  lastWeekAvg: number | null;
  weeklyRateKg: number | null;
  weeklyRatePctBodyweight: number | null;
  trend: "rising" | "stable" | "falling" | null;
  suggestion: TrendSuggestion | null;
};

const PERIOD_OPTIONS = [7, 14, 30] as const;
const DEFAULT_PERIOD = 14;

function cacheKeyFor(days: number) {
  return `weight-trend-${days}`;
}

// Whether a weight change is "good" news depends on what the active plan is
// actually going for — losing during a CUT is the goal, the same loss during
// a BULK is a problem. Falls back to neutral framing with no active plan.
function judgeDelta(
  phase: NutritionPhase | null,
  deltaKg: number | null
): "good" | "bad" | "neutral" {
  if (deltaKg == null) return "neutral";
  const flat = Math.abs(deltaKg) < 0.15;
  if (phase === "CUT") return deltaKg < 0 ? "good" : flat ? "neutral" : "bad";
  if (phase === "BULK") return deltaKg > 0 ? "good" : flat ? "neutral" : "bad";
  if (phase === "REVERSE_DIET" || phase === "MAINTENANCE") return flat ? "good" : "neutral";
  return "neutral";
}

export function WeightTrendCard() {
  const { t } = useI18n();
  const [period, setPeriod] = useState<number>(DEFAULT_PERIOD);
  const [data, setData] = useState<WeightTrendResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [accepting, setAccepting] = useState(false);

  async function load(days: number) {
    setLoading(true);
    const cached = await loadHealthCache<WeightTrendResult>(cacheKeyFor(days));
    if (cached) setData(cached);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setLoading(false);
      return;
    }
    try {
      const res = await authenticatedFetch(`/api/nutrition-plan/weight-trend?days=${days}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: WeightTrendResult };
      setData(json.data);
      void saveHealthCache(cacheKeyFor(days), json.data);
    } catch {
      // keep showing cache
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  async function acceptSuggestion() {
    if (!data?.suggestion) return;
    setAccepting(true);
    try {
      const planRes = await authenticatedFetch("/api/nutrition-plan", { credentials: "include" });
      const planJson = planRes.ok ? await planRes.json() : null;
      const active = planJson?.data?.active as
        | { phase: string; proteinPerKg: number; fatPerKg: number; minCalories: number | null; maxCalories: number | null }
        | null
        | undefined;
      if (!active) return;

      await authenticatedFetch("/api/nutrition-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          phase: active.phase,
          startDate: new Date().toISOString().slice(0, 10),
          startCalories: data.suggestion.proposedStartCalories,
          weeklyCalorieStep: data.suggestion.proposedWeeklyCalorieStep,
          minCalories: active.minCalories ?? undefined,
          maxCalories: active.maxCalories ?? undefined,
          proteinPerKg: active.proteinPerKg,
          fatPerKg: active.fatPerKg,
        }),
      });
      await load(period);
    } finally {
      setAccepting(false);
    }
  }

  if (loading && !data) return null;
  if (!data) return null;

  const hasAnyHistory = data.points.length > 0 || data.rawPoints.length > 0;
  if (!hasAnyHistory) return null;

  const chartData = data.rawPoints.map((p) => ({
    date: p.date.slice(5),
    value: Math.round(p.weightKg * 10) / 10,
  }));

  const TrendIcon = data.trend === "rising" ? TrendingUp : data.trend === "falling" ? TrendingDown : Minus;
  const trendColor = data.trend === "rising" ? "#FF9F0A" : data.trend === "falling" ? "#30D158" : "#9A9AA2";

  const { deltaKg, avgWeightKg, deltaPerWeekKg, count } = data.period;
  const judgment = judgeDelta(data.phase, deltaKg);
  const deltaColor = judgment === "good" ? "#30D158" : judgment === "bad" ? "#FF453A" : "#9A9AA2";
  const deltaLabel =
    deltaKg == null
      ? "—"
      : `${deltaKg > 0 ? "+" : ""}${deltaKg.toFixed(1)} kg`;

  return (
    <div className="space-y-3 rounded-[22px] p-4" style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#9A9AA2" }}>
          {t("health.weightTrend.title")}
        </p>
        {data.trend && (
          <span className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: trendColor }}>
            <TrendIcon className="h-3.5 w-3.5" />
            {t(`health.weightTrend.${data.trend}`)}
          </span>
        )}
      </div>

      <div className="flex gap-1.5">
        {PERIOD_OPTIONS.map((days) => (
          <button
            key={days}
            type="button"
            onClick={() => setPeriod(days)}
            className="rounded-full px-3 py-1 text-[12px] font-semibold transition-colors"
            style={{
              background: period === days ? "#FF9F0A" : "rgba(255,255,255,0.06)",
              color: period === days ? "#000" : "#9A9AA2",
            }}
          >
            {t("health.weightTrend.periodDays", { count: days })}
          </button>
        ))}
      </div>

      {chartData.length === 0 ? (
        <p className="text-[13px]" style={{ color: "#5E5E66" }}>{t("health.weightTrend.insufficientData")}</p>
      ) : (
        <>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#5E5E66" }} axisLine={false} tickLine={false} />
                <YAxis width={36} tick={{ fontSize: 10, fill: "#5E5E66" }} domain={["auto", "auto"]} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#1C1C1E" }} />
                <Line type="monotone" dataKey="value" stroke="#FF9F0A" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: "#5E5E66" }}>
                {t("health.weightTrend.periodAvg")}
              </p>
              <p className="mt-0.5 text-[15px] font-bold tabular-nums text-white">
                {avgWeightKg != null ? avgWeightKg.toFixed(1) : "—"}
                <span className="ml-1 text-[10px] font-normal" style={{ color: "#5E5E66" }}>kg</span>
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: "#5E5E66" }}>
                {t("health.weightTrend.periodChange")}
              </p>
              <p className="mt-0.5 text-[15px] font-bold tabular-nums" style={{ color: deltaColor }}>
                {deltaLabel}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: "#5E5E66" }}>
                {t("health.weightTrend.perWeek")}
              </p>
              <p className="mt-0.5 text-[15px] font-bold tabular-nums text-white">
                {deltaPerWeekKg != null ? `${deltaPerWeekKg > 0 ? "+" : ""}${deltaPerWeekKg.toFixed(2)}` : "—"}
                <span className="ml-1 text-[10px] font-normal" style={{ color: "#5E5E66" }}>kg</span>
              </p>
            </div>
          </div>
          <p className="text-[11px]" style={{ color: "#5E5E66" }}>
            {t("health.weightTrend.entryCount", { count })}
          </p>
        </>
      )}

      {data.suggestion && !dismissed && (
        <div className="space-y-2 rounded-2xl p-3" style={{ background: "rgba(255,159,10,0.08)", border: "1px solid rgba(255,159,10,0.2)" }}>
          <p className="text-[13px]" style={{ color: "#E8E8EE" }}>{t(data.suggestion.reasonKey)}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={acceptSuggestion}
              disabled={accepting}
              className="flex-1 rounded-full py-1.5 text-[13px] font-semibold"
              style={{ background: "#FF9F0A", color: "#000" }}
            >
              {accepting ? "…" : t("health.nutritionPlan.suggestion.accept")}
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="flex-1 rounded-full py-1.5 text-[13px] font-semibold"
              style={{ background: "rgba(255,255,255,0.06)", color: "#9A9AA2" }}
            >
              {t("health.nutritionPlan.suggestion.dismiss")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
