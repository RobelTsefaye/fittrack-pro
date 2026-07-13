"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "@/components/app-link";
import { ArrowLeft, Moon } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { METRICS } from "../metric-config";
import { AthleteScale } from "./metric-detail";
import type { HealthSnapshot } from "../types";
import { saveHealthCache, loadHealthCache } from "@/lib/offline/screen-caches";

const MetricAreaChart = dynamic(
  () => import("./metric-area-chart").then((m) => m.MetricAreaChart),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse rounded-xl bg-white/5" />,
  }
);

type Range = 7 | 30 | 90;

const SLEEP = METRICS.sleep;
const DEEP_COLOR = "#6E5BFF";
const REM_COLOR = "#64D2FF";

type StageBand = { min: number | null; max: number | null; label: string; color: string };

// Reference bands on stage share (% of total sleep), for adults.
const DEEP_BANDS: StageBand[] = [
  { min: null, max: 10, label: "Zu wenig — Regenerationsdefizit", color: "#FF453A" },
  { min: 10, max: 15, label: "Unter dem Optimum", color: "#FFB340" },
  { min: 15, max: 20, label: "Optimal", color: "#30D158" },
  { min: 20, max: null, label: "Sehr hoch — oft Nachholbedarf", color: "#64D2FF" },
];

const REM_BANDS: StageBand[] = [
  { min: null, max: 15, label: "Zu wenig", color: "#FF453A" },
  { min: 15, max: 20, label: "Unter dem Optimum", color: "#FFB340" },
  { min: 20, max: 25, label: "Optimal", color: "#30D158" },
  { min: 25, max: null, label: "Hoch", color: "#64D2FF" },
];

function bandFor(value: number | null, bands: StageBand[]): StageBand | null {
  if (value == null) return null;
  return (
    bands.find(
      (b) => (b.min == null || value >= b.min) && (b.max == null || value < b.max)
    ) ?? null
  );
}

const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

type Night = { date: string; duration: number | null; deepPct: number | null; remPct: number | null };

export function SleepDetail({
  initialSnapshots,
}: {
  initialSnapshots?: HealthSnapshot[];
}) {
  const hasInitialData = initialSnapshots != null;
  const [snapshots, setSnapshots] = useState<HealthSnapshot[]>(initialSnapshots ?? []);
  const [loading, setLoading] = useState(!hasInitialData);
  const [range, setRange] = useState<Range>(30);

  useEffect(() => {
    if (hasInitialData) return;
    let cancelled = false;
    (async () => {
      // Cache-first, always — paints the last-known nights instantly
      // instead of blocking on the network.
      const cached = await loadHealthCache<HealthSnapshot[]>("sleep");
      if (cancelled) return;
      if (cached) { setSnapshots(cached); setLoading(false); }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (!cached) setLoading(false);
        return;
      }
      try {
        const res = await fetch("/api/health-data?limit=90", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data: HealthSnapshot[] };
        if (!cancelled) {
          setSnapshots(json.data);
          void saveHealthCache("sleep", json.data);
        }
      } catch {
        // already showing cache (if any) — nothing more to do
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hasInitialData]);

  const nights = useMemo<Night[]>(() => {
    return snapshots.map((s) => {
      const totalMin = s.sleepDuration != null ? s.sleepDuration * 60 : null;
      const deepPct =
        totalMin && s.sleepDeepMinutes != null ? (s.sleepDeepMinutes / totalMin) * 100 : null;
      const remPct =
        totalMin && s.sleepRemMinutes != null ? (s.sleepRemMinutes / totalMin) * 100 : null;
      return { date: s.date.slice(0, 10), duration: s.sleepDuration, deepPct, remPct };
    });
  }, [snapshots]);

  const ranged = useMemo(() => nights.slice(-range), [nights, range]);

  const durationSeries = useMemo(
    () => ranged.filter((n) => n.duration != null).map((n) => ({ date: n.date, value: n.duration as number })),
    [ranged]
  );
  const deepSeries = useMemo(
    () => ranged.filter((n) => n.deepPct != null).map((n) => ({ date: n.date, value: n.deepPct as number })),
    [ranged]
  );
  const remSeries = useMemo(
    () => ranged.filter((n) => n.remPct != null).map((n) => ({ date: n.date, value: n.remPct as number })),
    [ranged]
  );

  const durationAvg = useMemo(() => avg(durationSeries.map((p) => p.value)), [durationSeries]);
  const deepAvg = useMemo(() => avg(deepSeries.map((p) => p.value)), [deepSeries]);
  const remAvg = useMemo(() => avg(remSeries.map((p) => p.value)), [remSeries]);

  const latestDuration = useMemo(
    () => nights.filter((n) => n.duration != null).at(-1)?.duration ?? null,
    [nights]
  );
  const latestDeep = deepSeries.at(-1)?.value ?? null;
  const latestRem = remSeries.at(-1)?.value ?? null;
  const hasStages = latestDeep != null || latestRem != null;

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
      <Link href={ROUTES.health} className="inline-flex items-center gap-1 text-[14px]" style={{ color: "#9A9AA2" }}>
        <ArrowLeft className="h-4 w-4" />
        Gesundheit
      </Link>

      <div>
        <div className="flex items-center gap-2">
          <Moon className="h-6 w-6" style={{ color: DEEP_COLOR }} />
          <h1 className="text-[28px] font-bold text-white">Schlaf</h1>
        </div>
        {(latestDuration != null || hasStages) && (
          <p className="mt-1 text-[15px]" style={{ color: "#9A9AA2" }}>
            Letzte Nacht:{" "}
            {latestDuration != null && (
              <span className="font-semibold" style={{ color: SLEEP.color }}>
                {SLEEP.format(latestDuration)} Std.
              </span>
            )}
            {latestDuration != null && latestDeep != null && " · "}
            {latestDeep != null && (
              <span className="font-semibold" style={{ color: DEEP_COLOR }}>
                {Math.round(latestDeep)}% Tief
              </span>
            )}
            {latestRem != null && " · "}
            {latestRem != null && (
              <span className="font-semibold" style={{ color: REM_COLOR }}>
                {Math.round(latestRem)}% REM
              </span>
            )}
          </p>
        )}
      </div>

      {/* Explainer */}
      <div className="rounded-[18px] p-4" style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}>
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: DEEP_COLOR }}>
          Was bedeutet das?
        </p>
        <p className="text-[13px] leading-relaxed" style={{ color: "#C0C0C8" }}>
          Erholung hängt an <strong className="text-white">Dauer</strong> und <strong className="text-white">Qualität</strong> des
          Schlafs. 7–9 Stunden gelten als optimal. Innerhalb der Nacht durchläufst du Zyklen aus Leicht-, Tief- und REM-Schlaf:{" "}
          <strong className="text-white">Tiefschlaf</strong> ist körperlich am erholsamsten (Wachstumshormone, Muskelreparatur) —
          Ziel ~15–20%. <strong className="text-white">REM</strong> dient der geistigen Erholung (Gedächtnis, emotionale Verarbeitung)
          — Ziel ~20–25%. Tiefschlaf ist in der ersten Nachthälfte am höchsten, REM zur zweiten. Zu kurzer Schlaf und Alkohol kürzen
          vor allem den REM-Anteil.
        </p>
      </div>

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

      {/* Duration */}
      <ChartCard
        title="Dauer"
        color={SLEEP.color}
        slug="sleep"
        unit="Std."
        format={SLEEP.format}
        series={durationSeries}
        avgLabel={durationAvg != null ? `${SLEEP.format(durationAvg)} Std.` : null}
      />
      {SLEEP.athleteScale && (
        <AthleteScale
          currentValue={latestDuration}
          scale={SLEEP.athleteScale}
          accent={SLEEP.color}
          formatValue={SLEEP.format}
          unit={SLEEP.unit}
        />
      )}

      {/* Stages */}
      <StageSection
        title="Tiefschlaf"
        color={DEEP_COLOR}
        slug="sleep-deep"
        series={deepSeries}
        avgPct={deepAvg}
        currentPct={latestDeep}
        bands={DEEP_BANDS}
      />
      <StageSection
        title="REM-Schlaf"
        color={REM_COLOR}
        slug="sleep-rem"
        series={remSeries}
        avgPct={remAvg}
        currentPct={latestRem}
        bands={REM_BANDS}
      />
    </div>
  );
}

function ChartCard({
  title, color, slug, unit, format, series, avgLabel,
}: {
  title: string;
  color: string;
  slug: string;
  unit: string;
  format: (v: number) => string;
  series: Array<{ date: string; value: number }>;
  avgLabel: string | null;
}) {
  return (
    <div className="rounded-[22px] p-4" style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[15px] font-semibold text-white">{title}</p>
        {avgLabel && (
          <p className="text-[12px]" style={{ color: "#9A9AA2" }}>
            Ø <span className="font-semibold" style={{ color }}>{avgLabel}</span>
          </p>
        )}
      </div>
      {series.length === 0 ? (
        <p className="py-10 text-center text-[13px]" style={{ color: "#5E5E66" }}>
          Keine Daten im gewählten Zeitraum
        </p>
      ) : (
        <div className="h-44 -ml-3">
          <MetricAreaChart data={series} slug={slug} color={color} unit={unit} label={title} format={format} />
        </div>
      )}
    </div>
  );
}

function StageSection({
  title, color, slug, series, avgPct, currentPct, bands,
}: {
  title: string;
  color: string;
  slug: string;
  series: Array<{ date: string; value: number }>;
  avgPct: number | null;
  currentPct: number | null;
  bands: StageBand[];
}) {
  const band = bandFor(currentPct, bands);
  const fmt = (v: number) => Math.round(v).toString();

  return (
    <div className="rounded-[22px] p-4" style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[15px] font-semibold text-white">{title}</p>
        {avgPct != null && (
          <p className="text-[12px]" style={{ color: "#9A9AA2" }}>
            Ø <span className="font-semibold" style={{ color }}>{Math.round(avgPct)}%</span>
          </p>
        )}
      </div>

      {band && (
        <div className="mb-3 flex items-center gap-2 text-[12px]">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: band.color }} />
          <span className="font-semibold" style={{ color: band.color }}>
            {currentPct != null ? `${Math.round(currentPct)}%` : "—"}
          </span>
          <span style={{ color: "#9A9AA2" }}>{band.label}</span>
        </div>
      )}

      {series.length === 0 ? (
        <p className="py-10 text-center text-[13px]" style={{ color: "#5E5E66" }}>
          Keine Phasendaten im gewählten Zeitraum
        </p>
      ) : (
        <div className="h-44 -ml-3">
          <MetricAreaChart data={series} slug={slug} color={color} unit="%" label={title} format={fmt} />
        </div>
      )}
    </div>
  );
}
