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

type TrendSuggestion = {
  kind: "bump_calories" | "reduce_calories";
  reasonKey: string;
  proposedWeeklyCalorieStep: number;
  proposedStartCalories: number;
};

type WeightTrendResult = {
  points: { date: string; rolling7d: number | null }[];
  thisWeekAvg: number | null;
  lastWeekAvg: number | null;
  weeklyRateKg: number | null;
  weeklyRatePctBodyweight: number | null;
  trend: "rising" | "stable" | "falling" | null;
  suggestion: TrendSuggestion | null;
};

const CACHE_KEY = "weight-trend";

export function WeightTrendCard() {
  const { t } = useI18n();
  const [data, setData] = useState<WeightTrendResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [accepting, setAccepting] = useState(false);

  async function load() {
    const cached = await loadHealthCache<WeightTrendResult>(CACHE_KEY);
    if (cached) setData(cached);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setLoading(false);
      return;
    }
    try {
      const res = await authenticatedFetch("/api/nutrition-plan/weight-trend", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: WeightTrendResult };
      setData(json.data);
      void saveHealthCache(CACHE_KEY, json.data);
    } catch {
      // keep showing cache
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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
      await load();
    } finally {
      setAccepting(false);
    }
  }

  if (loading && !data) return null;
  if (!data || data.points.length === 0) return null;

  const chartData = data.points
    .filter((p) => p.rolling7d != null)
    .map((p) => ({ date: p.date.slice(5), value: Math.round((p.rolling7d as number) * 10) / 10 }));

  if (chartData.length === 0) {
    return (
      <div className="rounded-[22px] p-4" style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}>
        <p className="text-[13px]" style={{ color: "#5E5E66" }}>{t("health.weightTrend.insufficientData")}</p>
      </div>
    );
  }

  const TrendIcon = data.trend === "rising" ? TrendingUp : data.trend === "falling" ? TrendingDown : Minus;
  const trendColor = data.trend === "rising" ? "#FF9F0A" : data.trend === "falling" ? "#30D158" : "#9A9AA2";

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

      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#5E5E66" }} axisLine={false} tickLine={false} />
            <YAxis width={36} tick={{ fontSize: 10, fill: "#5E5E66" }} domain={["auto", "auto"]} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#1C1C1E" }} />
            <Line type="monotone" dataKey="value" stroke="#FF9F0A" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {(data.thisWeekAvg != null || data.lastWeekAvg != null) && (
        <div className="grid grid-cols-2 gap-2 text-[12px]" style={{ color: "#9A9AA2" }}>
          <div>
            {t("health.weightTrend.thisWeek")}: <span className="font-semibold text-white">{data.thisWeekAvg?.toFixed(1) ?? "—"}</span>
          </div>
          <div>
            {t("health.weightTrend.lastWeek")}: <span className="font-semibold text-white">{data.lastWeekAvg?.toFixed(1) ?? "—"}</span>
          </div>
        </div>
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
