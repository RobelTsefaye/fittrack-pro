"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { ROUTES } from "@/lib/constants";
import { METRICS, type MetricSlug, type ScaleBand } from "../metric-config";
import type { HealthSnapshot } from "../types";

type Range = 7 | 30 | 90;

export function MetricDetail({ slug }: { slug: MetricSlug }) {
  const config = METRICS[slug];
  const [snapshots, setSnapshots] = useState<HealthSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>(30);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/health-data?limit=90", { credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json()) as { data: HealthSnapshot[] };
      if (!cancelled) {
        setSnapshots(json.data);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const series = useMemo(() => {
    return snapshots
      .map((s) => {
        const raw = s[config.field];
        return {
          date: s.date.slice(0, 10),
          value: typeof raw === "number" ? raw : null,
        };
      })
      .filter((p) => p.value != null) as Array<{ date: string; value: number }>;
  }, [snapshots, config.field]);

  const ranged = useMemo(() => series.slice(-range), [series, range]);
  const recent7 = useMemo(() => series.slice(-7), [series]);
  const recent30 = useMemo(() => series.slice(-30), [series]);

  const stats = useMemo(() => {
    const values = ranged.map((p) => p.value);
    if (values.length === 0) return null;
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const latest = series[series.length - 1]?.value ?? null;
    const avg7 = recent7.length
      ? recent7.reduce((a, b) => a + b.value, 0) / recent7.length
      : null;
    const avg30 = recent30.length
      ? recent30.reduce((a, b) => a + b.value, 0) / recent30.length
      : null;
    return { avg, min, max, latest, avg7, avg30 };
  }, [ranged, recent7, recent30, series]);

  const trend = useMemo(() => {
    if (!stats?.avg7 || !stats?.avg30) return null;
    const diff = stats.avg7 - stats.avg30;
    const pct = (diff / stats.avg30) * 100;
    if (Math.abs(pct) < 2) return { dir: "flat" as const, pct };
    return { dir: diff > 0 ? "up" as const : "down" as const, pct };
  }, [stats]);

  const trendIsGood =
    trend?.dir === "flat" ? null
    : trend?.dir === "up"
      ? config.betterDirection === "higher"
      : config.betterDirection === "lower";

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-32 animate-pulse rounded bg-white/5" />
        <div className="h-32 animate-pulse rounded-[22px] bg-white/5" />
        <div className="h-48 animate-pulse rounded-[22px] bg-white/5" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <Link
        href={ROUTES.health}
        className="inline-flex items-center gap-1 text-[14px]"
        style={{ color: "#9A9AA2" }}
      >
        <ArrowLeft className="h-4 w-4" />
        Gesundheit
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-[28px] font-bold text-white">{config.label}</h1>
        {stats?.latest != null && (
          <p className="mt-1 text-[15px]" style={{ color: "#9A9AA2" }}>
            Aktuell:{" "}
            <span className="font-semibold" style={{ color: config.color }}>
              {config.format(stats.latest)} {config.unit}
            </span>
          </p>
        )}
      </div>

      {/* About this metric */}
      <div
        className="rounded-[18px] p-4"
        style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: config.color }}>
          Was bedeutet das?
        </p>
        <p className="text-[13px] leading-relaxed" style={{ color: "#C0C0C8" }}>
          {config.description}
        </p>
      </div>

      {/* Athlete-targeted reference scale */}
      <AthleteScale
        currentValue={stats?.latest ?? null}
        scale={config.athleteScale}
        accent={config.color}
        formatValue={config.format}
        unit={config.unit}
      />

      {/* Trend badge */}
      {trend && trendIsGood != null && (
        <div
          className="flex items-center gap-2 rounded-full px-3 py-1.5 w-fit text-[12px] font-semibold"
          style={{
            background: trendIsGood ? "rgba(48,209,88,0.15)" : "rgba(255,69,58,0.15)",
            color: trendIsGood ? "#30D158" : "#FF453A",
          }}
        >
          {trend.dir === "up" ? <TrendingUp className="h-3.5 w-3.5" /> :
           trend.dir === "down" ? <TrendingDown className="h-3.5 w-3.5" /> :
           <Minus className="h-3.5 w-3.5" />}
          {Math.abs(trend.pct).toFixed(0)}% vs. 30-Tage-Schnitt
        </div>
      )}

      {/* Range toggle */}
      <div className="flex gap-2">
        {([7, 30, 90] as Range[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setRange(d)}
            className="rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors"
            style={
              range === d
                ? { background: "#D4FF3A", color: "#0A1300" }
                : { background: "rgba(255,255,255,0.06)", color: "#9A9AA2" }
            }
          >
            {d} Tage
          </button>
        ))}
      </div>

      {/* Chart */}
      <div
        className="rounded-[22px] p-4"
        style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {ranged.length === 0 ? (
          <p className="py-12 text-center text-[14px]" style={{ color: "#5E5E66" }}>
            Keine Daten im gewählten Zeitraum
          </p>
        ) : (
          <div className="h-56 -ml-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ranged} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`grad-${slug}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={config.color} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={config.color} stopOpacity={0} />
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
                  formatter={(v) => [
                    `${config.format(Number(v))} ${config.unit}`.trim(),
                    config.label,
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={config.color}
                  strokeWidth={2}
                  fill={`url(#grad-${slug})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatBox label={`Ø ${range}T`} value={`${config.format(stats.avg)}`} unit={config.unit} />
          <StatBox label="Ø 7 Tage" value={stats.avg7 != null ? config.format(stats.avg7) : "—"} unit={config.unit} />
          <StatBox label="Maximum" value={config.format(stats.max)} unit={config.unit} />
          <StatBox label="Minimum" value={config.format(stats.min)} unit={config.unit} />
        </div>
      )}

      {/* Recent entries */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#9A9AA2" }}>
          Verlauf
        </p>
        <div
          className="overflow-hidden rounded-[18px]"
          style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {[...ranged].reverse().slice(0, 14).map((p, i) => (
            <div
              key={p.date}
              className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : "none" }}
            >
              <span className="text-[13px]" style={{ color: "#9A9AA2" }}>
                {new Date(p.date).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })}
              </span>
              <span className="text-[14px] font-semibold text-white">
                {config.format(p.value)}
                {config.unit && <span className="ml-1 text-[12px]" style={{ color: "#9A9AA2" }}>{config.unit}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AthleteScale({
  currentValue,
  scale,
  accent,
  formatValue,
  unit,
}: {
  currentValue: number | null;
  scale: ScaleBand[];
  accent: string;
  formatValue: (v: number) => string;
  unit: string;
}) {
  const activeIdx =
    currentValue == null
      ? -1
      : scale.findIndex(
          (b) =>
            (b.min == null || currentValue >= b.min) &&
            (b.max == null || currentValue < b.max),
        );

  const unitSuffix = unit ? ` ${unit}` : "";
  const fmtRange = (band: ScaleBand) => {
    if (band.min == null && band.max != null) return `< ${formatValue(band.max)}${unitSuffix}`;
    if (band.max == null && band.min != null) return `≥ ${formatValue(band.min)}${unitSuffix}`;
    if (band.min != null && band.max != null) return `${formatValue(band.min)}–${formatValue(band.max)}${unitSuffix}`;
    return "";
  };

  return (
    <div
      className="rounded-[18px] p-4"
      style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: accent }}>
        Sportler-Referenz
      </p>
      <p className="mt-0.5 text-[11px]" style={{ color: "#5E5E66" }}>
        Skala für trainierte Erwachsene — nicht für die Allgemeinbevölkerung.
      </p>

      {/* Gradient segments */}
      <div className="mt-3 flex h-2 overflow-hidden rounded-full">
        {scale.map((band, i) => (
          <div
            key={i}
            className="flex-1 transition-opacity"
            style={{
              background: band.color,
              opacity: activeIdx === -1 ? 0.55 : activeIdx === i ? 1 : 0.35,
            }}
          />
        ))}
      </div>

      {/* Labeled bands */}
      <div className="mt-3 space-y-1">
        {scale.map((band, i) => {
          const isActive = activeIdx === i;
          return (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12px]"
              style={{
                background: isActive ? `${band.color}1F` : "transparent",
                border: `1px solid ${isActive ? band.color : "transparent"}`,
              }}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: band.color }}
              />
              <span
                className="shrink-0 font-semibold tabular-nums"
                style={{ color: isActive ? "#fff" : "#C0C0C8", minWidth: 78 }}
              >
                {fmtRange(band)}
              </span>
              <span className="flex-1 leading-snug" style={{ color: isActive ? "#fff" : "#9A9AA2" }}>
                {band.label}
              </span>
              {isActive && (
                <span
                  className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                  style={{ background: band.color, color: "#0A1300" }}
                >
                  Du
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatBox({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div
      className="rounded-2xl p-3"
      style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#9A9AA2" }}>{label}</p>
      <p className="mt-1 text-[18px] font-bold leading-none text-white">
        {value}
        {unit && <span className="ml-1 text-[12px] font-normal" style={{ color: "#9A9AA2" }}>{unit}</span>}
      </p>
    </div>
  );
}
