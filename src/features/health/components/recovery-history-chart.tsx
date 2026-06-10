"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { RecoveryHistoryPoint } from "../recovery";

export function RecoveryHistoryChart({ history }: { history: RecoveryHistoryPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="grad-recovery" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4FF3A" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#D4FF3A" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="date"
          stroke="#5E5E66"
          fontSize={10}
          tickFormatter={(d) => {
            const dt = new Date(d as string);
            return `${dt.getDate()}.${dt.getMonth() + 1}.`;
          }}
        />
        <YAxis
          stroke="#5E5E66"
          fontSize={10}
          width={28}
          domain={[0, 100]}
          ticks={[0, 50, 75, 100]}
        />
        <Tooltip
          contentStyle={{
            background: "#1C1C1E",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            fontSize: 12,
            color: "#fff",
          }}
          labelFormatter={(d) => new Date(d as string).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })}
          formatter={(v) => [`${v} / 100`, "Recovery"]}
        />
        <ReferenceLine y={75} stroke="rgba(48,209,88,0.3)" strokeDasharray="3 3" />
        <ReferenceLine y={50} stroke="rgba(255,179,64,0.3)" strokeDasharray="3 3" />
        <Area
          type="monotone"
          dataKey="score"
          stroke="#D4FF3A"
          strokeWidth={2}
          fill="url(#grad-recovery)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
