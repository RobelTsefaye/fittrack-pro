"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { type HealthSnapshot } from "../types";

interface HealthMetricChartProps {
  data: HealthSnapshot[];
  metric: keyof HealthSnapshot;
  label: string;
  unit?: string;
  color?: string;
  days?: 7 | 30;
}

export function HealthMetricChart({
  data,
  metric,
  label,
  unit = "",
  color = "#D4FF3A",
  days = 7,
}: HealthMetricChartProps) {
  const sliced = data.slice(-days);

  const chartData = sliced.map((s) => ({
    date: new Date(s.date).toLocaleDateString(undefined, {
      weekday: days === 7 ? "short" : undefined,
      month: days === 30 ? "short" : undefined,
      day: "numeric",
    }),
    value: s[metric] as number | null,
  }));

  const hasData = chartData.some((d) => d.value != null);
  if (!hasData) return null;

  return (
    <div
      className="rounded-[18px] p-4"
      style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <p className="mb-3 text-[13px] font-semibold text-white">{label}</p>
      <ResponsiveContainer width="100%" height={90}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`grad-${metric as string}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#9A9AA2" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{
              background: "#1C1C1E",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              fontSize: 12,
              color: "#fff",
            }}
            formatter={(v) => [`${v ?? ""}${unit ? ` ${unit}` : ""}`, label]}
            labelStyle={{ color: "#9A9AA2" }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#grad-${metric as string})`}
            connectNulls
            dot={false}
            activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
