"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import type { CardioWeekPoint } from "../cardio";

export function CardioVolumeChart({
  data,
  metric = "distance",
  accent = "#64D2FF",
}: {
  data: CardioWeekPoint[];
  /** Which metric to plot: distance (km) for outdoor, time (min) for indoor */
  metric?: "distance" | "time";
  accent?: string;
}) {
  const dataKey: keyof CardioWeekPoint = metric === "distance" ? "distanceKm" : "durationMin";

  const values = data.map((d) => Number(d[dataKey] ?? 0));
  const maxVal = Math.max(...values, 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="label"
          stroke="#5E5E66"
          fontSize={10}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="#5E5E66"
          fontSize={10}
          width={28}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => v === 0 ? "" : metric === "distance" ? `${v}` : `${Math.round(v)}`}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={{
            background: "#1C1C1E",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            fontSize: 12,
            color: "#fff",
          }}
          labelFormatter={(label, payload) => {
            const p = (payload?.[0]?.payload as CardioWeekPoint | undefined);
            if (!p) return String(label ?? "");
            const start = new Date(p.weekStart);
            return `${String(label)} · ab ${start.toLocaleDateString("de-DE", { day: "numeric", month: "short" })}`;
          }}
          formatter={(_v, _name, item) => {
            const p = item?.payload as CardioWeekPoint;
            const headline = metric === "distance"
              ? `${p.distanceKm.toFixed(1)} km`
              : `${Math.round(p.durationMin)} min`;
            return [
              <span key="v" style={{ color: "#fff" }}>
                {headline} · {p.sessions}×{metric === "distance" && ` · ${Math.round(p.durationMin)} min`}
              </span>,
              "",
            ];
          }}
        />
        <Bar dataKey={dataKey} radius={[4, 4, 0, 0]}>
          {values.map((v, i) => (
            <Cell
              key={i}
              fill={v > 0 ? accent : "rgba(255,255,255,0.06)"}
              fillOpacity={v === maxVal && maxVal > 0 ? 1 : 0.7}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

