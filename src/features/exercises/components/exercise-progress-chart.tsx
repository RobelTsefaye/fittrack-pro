"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "@/lib/i18n-provider";
import type { ProgressPoint } from "@/features/exercises/progress-types";

export type { ProgressPoint };

interface ExerciseProgressChartProps {
  data: ProgressPoint[];
  weightUnit: "KG" | "LB";
}

export function ExerciseProgressChart({ data, weightUnit }: ExerciseProgressChartProps) {
  const { t } = useI18n();
  const unit = weightUnit === "LB" ? "lb" : "kg";

  if (data.length < 2) {
    return (
      <div className="flex h-[220px] items-center justify-center text-center text-sm text-muted-foreground px-4">
        {t("exercises.trendEmpty")}
      </div>
    );
  }

  const chartRows = data.map((p) => ({
    ...p,
    e1rmRounded: Math.round(p.bestEstimated1RM * 10) / 10,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartRows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
        <YAxis
          width={44}
          tick={{ fontSize: 10 }}
          domain={["auto", "auto"]}
          className="text-muted-foreground"
        />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--card)",
          }}
          formatter={(value) => [
            typeof value === "number" ? `${value} ${unit}` : "—",
            "Est. 1RM",
          ]}
          labelFormatter={(label) => `Date: ${label}`}
        />
        <Line
          type="monotone"
          dataKey="e1rmRounded"
          stroke="var(--color-chart-2)"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
