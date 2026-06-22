"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import type { CardioWeekPoint } from "../cardio";

export function CardioVolumeChart({ data }: { data: CardioWeekPoint[] }) {
  const maxDist = Math.max(...data.map((d) => d.distanceKm), 1);

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
          tickFormatter={(v) => v === 0 ? "" : `${v}`}
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
            return [
              <span key="v" style={{ color: "#fff" }}>
                {p.distanceKm.toFixed(1)} km · {p.sessions}× · {Math.round(p.durationMin)} min
              </span>,
              "",
            ];
          }}
        />
        <Bar dataKey="distanceKm" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.distanceKm > 0 ? "#64D2FF" : "rgba(255,255,255,0.06)"}
              fillOpacity={d.distanceKm === maxDist && maxDist > 0 ? 1 : 0.75}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
