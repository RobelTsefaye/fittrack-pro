"use client";

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

function CustomTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-[var(--card)] px-3 py-2 shadow-lg ring-1 ring-[var(--sys-separator)] text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value} cm
        </p>
      ))}
    </div>
  );
}

export function MeasurementLineChart({
  data,
  dataKey,
  color,
}: {
  data: Array<Record<string, string | number | null | undefined>>;
  dataKey: string;
  color: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--sys-separator)" strokeOpacity={0.5} />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="var(--sys-label3)" />
        <YAxis tick={{ fontSize: 10 }} stroke="var(--sys-label3)" domain={["auto", "auto"]} />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2.5}
          dot={{ r: 3.5, fill: color }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
