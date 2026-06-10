"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

export function MetricAreaChart({
  data,
  slug,
  color,
  unit,
  label,
  format,
}: {
  data: Array<{ date: string; value: number }>;
  slug: string;
  color: string;
  unit: string;
  label: string;
  format: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`grad-${slug}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="date"
          stroke="#5E5E66"
          fontSize={10}
          tickFormatter={(d) => {
            const dt = new Date(d);
            return `${dt.getDate()}.${dt.getMonth() + 1}.`;
          }}
        />
        <YAxis stroke="#5E5E66" fontSize={10} width={40} />
        <Tooltip
          contentStyle={{
            background: "#1C1C1E",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            fontSize: 12,
            color: "#fff",
          }}
          labelFormatter={(d) => {
            const dt = new Date(d as string);
            return dt.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
          }}
          formatter={(v) => [`${format(Number(v))} ${unit}`.trim(), label]}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#grad-${slug})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
