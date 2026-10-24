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

interface BodyWeightChartProps {
  data: { date: string; weight: number; avg7?: number }[];
  unitLabel: string;
}

export function BodyWeightChart({ data, unitLabel }: BodyWeightChartProps) {
  const { t } = useI18n();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
        <YAxis
          width={40}
          tick={{ fontSize: 11 }}
          domain={["auto", "auto"]}
          className="text-muted-foreground"
          label={{
            value: unitLabel,
            angle: -90,
            position: "insideLeft",
            style: { fontSize: 11, fill: "var(--muted-foreground)" },
          }}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--card)",
          }}
          formatter={(v, name) => [
            typeof v === "number" ? `${v} ${unitLabel}` : "—",
            name === "avg7" ? t("bodyWeight.chartSeriesAvg") : t("bodyWeight.chartSeriesWeight"),
          ]}
        />
        {/* Daily weigh-ins as faint dots; the 7-day mean is the real trend. */}
        <Line
          type="monotone"
          dataKey="weight"
          stroke="var(--color-chart-1)"
          strokeOpacity={0.25}
          strokeWidth={1}
          dot={{ r: 2.5, fillOpacity: 0.6 }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="avg7"
          stroke="var(--color-chart-1)"
          strokeWidth={2.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
