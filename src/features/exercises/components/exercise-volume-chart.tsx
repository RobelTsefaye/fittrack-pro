"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "@/lib/i18n-provider";
import type { VolumePoint } from "@/features/exercises/progress-types";

interface ExerciseVolumeChartProps {
  data: VolumePoint[];
}

export function ExerciseVolumeChart({ data }: ExerciseVolumeChartProps) {
  const { t } = useI18n();

  if (data.length < 2) {
    return (
      <div className="flex h-[200px] items-center justify-center text-center text-sm text-muted-foreground px-4">
        {t("exercises.volumeEmpty")}
      </div>
    );
  }

  const rows = data.map((p) => ({
    ...p,
    volumeRounded: Math.round(p.volume),
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
            typeof value === "number" ? String(value) : "—",
            t("exercises.volumeSeriesLabel"),
          ]}
          labelFormatter={(label) => `${t("exercises.tableDate")}: ${label}`}
        />
        <Bar dataKey="volumeRounded" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
