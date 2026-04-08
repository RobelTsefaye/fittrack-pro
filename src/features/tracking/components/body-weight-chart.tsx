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
  data: { date: string; weight: number }[];
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
          formatter={(v) => [
            typeof v === "number" ? `${v} ${unitLabel}` : "—",
            t("bodyWeight.chartSeriesWeight"),
          ]}
        />
        <Line
          type="monotone"
          dataKey="weight"
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
