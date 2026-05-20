"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Moon, Heart, Zap, Dumbbell, Footprints } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { ROUTES } from "@/lib/constants";
import type { RecoveryBreakdown, RecoveryHistoryPoint } from "../recovery";

export function RecoveryDetail() {
  const [recovery, setRecovery] = useState<RecoveryBreakdown | null>(null);
  const [history, setHistory] = useState<RecoveryHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/health/recovery", { credentials: "include" });
      if (!res.ok) { if (!cancelled) setLoading(false); return; }
      const json = (await res.json()) as { data: RecoveryBreakdown; history: RecoveryHistoryPoint[] };
      if (!cancelled) {
        setRecovery(json.data);
        setHistory(json.history ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-32 animate-pulse rounded bg-white/5" />
        <div className="h-32 animate-pulse rounded-[22px] bg-white/5" />
        <div className="h-48 animate-pulse rounded-[22px] bg-white/5" />
      </div>
    );
  }

  if (!recovery || recovery.level === "none") {
    return (
      <div className="space-y-4">
        <Back />
        <div className="rounded-[22px] p-8 text-center" style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-[14px]" style={{ color: "#9A9AA2" }}>
            Noch keine Recovery-Daten verfügbar. Trage Schlaf, HRV oder Ruhepuls in Apple Health ein.
          </p>
        </div>
      </div>
    );
  }

  const color =
    recovery.level === "high" ? "#D4FF3A"
    : recovery.level === "mid" ? "#FFB340"
    : "#FF453A";

  return (
    <div className="space-y-4 pb-8">
      <Back />

      <div>
        <h1 className="text-[28px] font-bold text-white">Recovery-Score</h1>
        <p className="mt-1 text-[15px]" style={{ color: "#9A9AA2" }}>
          Heute:{" "}
          <span className="font-semibold" style={{ color }}>
            {recovery.score} / 100 ·{" "}
            {recovery.level === "high" ? "Ready to Train" : recovery.level === "mid" ? "Moderate" : "Rest Day"}
          </span>
        </p>
      </div>

      {/* History chart */}
      <HistoryChart history={history} />

      {/* Sub-score cards */}
      <SleepCard score={recovery.sleepScore} />
      <HRCard
        score={recovery.hrScore}
        baseline={recovery.baseline.restingHR}
        daysOfData={recovery.baseline.hrDays}
        trend={recovery.trends.hrTrend}
      />
      <HRVCard
        score={recovery.hrvScore}
        baseline={recovery.baseline.hrv}
        daysOfData={recovery.baseline.hrvDays}
        trend={recovery.trends.hrvTrend}
      />
      <LoadCard score={recovery.loadScore} load={recovery.trainingLoad} />
      <ActivityCard
        score={recovery.activityScore}
        baseline={recovery.baseline}
      />
    </div>
  );
}

function HistoryChart({ history }: { history: RecoveryHistoryPoint[] }) {
  if (history.length < 2) {
    return (
      <div
        className="rounded-[22px] p-5 text-center"
        style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#9A9AA2" }}>
          Verlauf
        </p>
        <p className="mt-2 text-[13px]" style={{ color: "#5E5E66" }}>
          Noch zu wenig Daten — Verlauf erscheint nach einigen Tagen.
        </p>
      </div>
    );
  }

  const avg = Math.round(history.reduce((s, p) => s + p.score, 0) / history.length);

  return (
    <div
      className="rounded-[22px] p-4"
      style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#9A9AA2" }}>
            Verlauf · letzte {history.length} Tage
          </p>
          <p className="mt-0.5 text-[13px]" style={{ color: "#9A9AA2" }}>
            Durchschnitt:{" "}
            <span className="font-semibold text-white">{avg} / 100</span>
          </p>
        </div>
      </div>

      <div className="h-44 -ml-3">
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
      </div>
    </div>
  );
}

function Back() {
  return (
    <Link href={ROUTES.health} className="inline-flex items-center gap-1 text-[14px]" style={{ color: "#9A9AA2" }}>
      <ArrowLeft className="h-4 w-4" />
      Gesundheit
    </Link>
  );
}

function Card({ icon, title, accent, children, score, weight }: {
  icon: React.ReactNode;
  title: string;
  accent: string;
  children: React.ReactNode;
  score: number | null;
  weight: number;
}) {
  return (
    <div className="rounded-[22px] p-4" style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span style={{ color: accent }}>{icon}</span>
          <div>
            <p className="text-[15px] font-semibold text-white">{title}</p>
            <p className="text-[11px]" style={{ color: "#5E5E66" }}>Gewicht: {Math.round(weight * 100)}%</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[20px] font-bold leading-none" style={{ color: score != null ? accent : "#5E5E66" }}>
            {score != null ? Math.round(score) : "—"}
          </p>
          <p className="text-[10px]" style={{ color: "#5E5E66" }}>/100</p>
        </div>
      </div>
      <div className="space-y-2 text-[13px]" style={{ color: "#9A9AA2" }}>
        {children}
      </div>
    </div>
  );
}

function Row({ k, v, vColor }: { k: string; v: string; vColor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{k}</span>
      <span className="font-medium" style={{ color: vColor ?? "white" }}>{v}</span>
    </div>
  );
}

function TrendBadge({ trend, invert }: { trend: "rising" | "stable" | "falling" | null; invert?: boolean }) {
  if (!trend || trend === "stable") return null;
  const rising = trend === "rising";
  const good = invert ? !rising : rising;
  const color = good ? "#30D158" : "#FF453A";
  const label = rising
    ? (invert ? "↑ steigend (Warnsignal)" : "↑ steigend (positiv)")
    : (invert ? "↓ sinkend (positiv)" : "↓ sinkend (Warnsignal)");
  return (
    <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${color}22`, color }}>
      {label}
    </span>
  );
}

// ── Sleep ───────────────────────────────────────────────────────────────────

function SleepCard({ score }: { score: number | null }) {
  let detail: React.ReactNode;
  if (score == null) {
    detail = <p>Keine Schlafdaten für heute.</p>;
  } else {
    const band =
      score === 100 ? "≥ 8 Std." :
      score >= 85  ? "7–8 Std." :
      score >= 65  ? "6–7 Std." :
      score >= 40  ? "5–6 Std." :
                     "< 5 Std.";
    detail = (
      <>
        <Row k="Heute" v={band} />
        <p className="pt-1 text-[11px] leading-relaxed" style={{ color: "#5E5E66" }}>
          Schlaf wird absolut bewertet (Dauer + Qualität wenn verfügbar).
          Richtwerte: 8h → 100, 7h → 85, 6h → 65, 5h → 40. Werte dazwischen
          werden linear interpoliert (7.5h ≈ 92). Wenn Apple Health eine
          Schlafqualität meldet: 60% Dauer + 40% Qualität.
        </p>
      </>
    );
  }
  return <Card icon={<Moon className="h-4 w-4" />} title="Schlaf" accent="#6E5BFF" score={score} weight={0.20}>{detail}</Card>;
}

// ── Resting HR ───────────────────────────────────────────────────────────────

function HRCard({
  score, baseline, daysOfData, trend,
}: {
  score: number | null;
  baseline: number | null;
  daysOfData: number;
  trend: "rising" | "stable" | "falling" | null;
}) {
  let detail: React.ReactNode;
  if (score == null) {
    detail = <p>Kein Ruhepuls für heute verfügbar.</p>;
  } else if (baseline != null) {
    detail = (
      <>
        <div className="flex items-center">
          <span>Baseline (Median aus {daysOfData} Tag{daysOfData !== 1 ? "en" : ""})</span>
          <TrendBadge trend={trend} invert />
        </div>
        <Row k="" v={`${baseline.toFixed(0)} bpm`} />
        <p className="pt-1 text-[11px] leading-relaxed" style={{ color: "#5E5E66" }}>
          Niedriger Ruhepuls = bessere Erholung. Verhältnis zu deiner Baseline:
          0.95 → 100, 1.0 → 85, 1.05 → 65, 1.10 → 40, 1.20 → 20.
          Werte dazwischen werden linear interpoliert.
          Zusätzlich: pro 1 bpm/Tag Anstieg im 3-Tage-Trend −10 Punkte
          (max. −15), pro 1 bpm/Tag Abfall +10 (max. +5).
        </p>
      </>
    );
  } else {
    detail = (
      <>
        <div className="flex items-center">
          <p>
            {daysOfData === 0
              ? "Noch keine Ruhepuls-Daten gesammelt."
              : <>Erst <span className="text-white font-medium">{daysOfData} Tag{daysOfData !== 1 ? "e" : ""}</span> Daten — Baseline braucht ≥7. Fallback auf feste Schwellen.</>
            }
          </p>
          <TrendBadge trend={trend} invert />
        </div>
        <p className="pt-1 text-[11px] leading-relaxed" style={{ color: "#5E5E66" }}>
          Richtwerte: 50 → 100, 60 → 85, 70 → 65, 80 → 40, 95 → 20.
          Werte dazwischen werden linear interpoliert.
        </p>
      </>
    );
  }
  return <Card icon={<Heart className="h-4 w-4" />} title="Ruhepuls" accent="#FF453A" score={score} weight={0.15}>{detail}</Card>;
}

// ── HRV ─────────────────────────────────────────────────────────────────────

function HRVCard({
  score, baseline, daysOfData, trend,
}: {
  score: number | null;
  baseline: number | null;
  daysOfData: number;
  trend: "rising" | "stable" | "falling" | null;
}) {
  let detail: React.ReactNode;
  if (score == null) {
    detail = <p>Keine HRV für heute verfügbar.</p>;
  } else if (baseline != null) {
    detail = (
      <>
        <div className="flex items-center">
          <span>Baseline (Median aus {daysOfData} Tag{daysOfData !== 1 ? "en" : ""})</span>
          <TrendBadge trend={trend} />
        </div>
        <Row k="" v={`${baseline.toFixed(0)} ms`} />
        <p className="pt-1 text-[11px] leading-relaxed" style={{ color: "#5E5E66" }}>
          Höhere HRV = bessere Erholung. Verhältnis zu deiner Baseline:
          1.10 → 100, 1.0 → 85, 0.9 → 65, 0.8 → 40, 0.5 → 20.
          Werte dazwischen werden linear interpoliert.
          Zusätzlich: pro 1 ms/Tag Abfall im 3-Tage-Trend −5 Punkte
          (max. −15), pro 1 ms/Tag Anstieg +5 (max. +8).
        </p>
      </>
    );
  } else {
    detail = (
      <>
        <div className="flex items-center">
          <p>
            {daysOfData === 0
              ? "Noch keine HRV-Daten gesammelt."
              : <>Erst <span className="text-white font-medium">{daysOfData} Tag{daysOfData !== 1 ? "e" : ""}</span> Daten — Baseline braucht ≥7. Fallback auf feste Schwellen.</>
            }
          </p>
          <TrendBadge trend={trend} />
        </div>
        <p className="pt-1 text-[11px] leading-relaxed" style={{ color: "#5E5E66" }}>
          Richtwerte: 80 → 100, 60 → 85, 40 → 65, 25 → 40, 5 → 20.
          Werte dazwischen werden linear interpoliert.
        </p>
      </>
    );
  }
  return <Card icon={<Zap className="h-4 w-4" />} title="HRV" accent="#30D158" score={score} weight={0.25}>{detail}</Card>;
}

// ── Training Load ─────────────────────────────────────────────────────────────

function LoadCard({
  score, load,
}: {
  score: number | null;
  load: RecoveryBreakdown["trainingLoad"];
}) {
  let detail: React.ReactNode;

  if (load.daysSinceLast == null) {
    detail = (
      <>
        <p>Keine Workouts im ACWR-Fenster (letzte 28 Tage) — voll erholt.</p>
        <p className="pt-1 text-[11px] leading-relaxed" style={{ color: "#5E5E66" }}>
          Score 100 da keine Trainingsbelastung vorhanden.
        </p>
      </>
    );
  } else {
    const acwrColor =
      load.acwr == null ? "#9A9AA2"
      : load.acwr < 0.8 ? "#FFB340"
      : load.acwr < 1.3 ? "#30D158"
      : load.acwr < 1.5 ? "#FFB340"
      : "#FF453A";

    const acwrLabel =
      load.acwr == null ? null
      : load.acwr < 0.5 ? "Untertraining"
      : load.acwr < 0.8 ? "Leicht untertrainiert"
      : load.acwr < 1.0 ? "Optimaler Bereich"
      : load.acwr < 1.3 ? "Leicht erhöht"
      : load.acwr < 1.5 ? "Spike — Verletzungsrisiko"
      : "Gefahrenzone";

    const intensityLabel =
      load.intensity === "high" ? "intensiv (≥130% des Tagesschnitts)"
      : load.intensity === "low" ? "leicht (≤70%)"
      : "mittel";

    const consPenalty = load.consecutiveDays >= 2
      ? Math.round((1 - Math.max(0.60, 1 - (load.consecutiveDays - 1) * 0.15)) * 100)
      : 0;

    detail = (
      <>
        <Row
          k="Letztes Training"
          v={load.daysSinceLast === 0 ? "heute" : load.daysSinceLast === 1 ? "gestern" : `vor ${load.daysSinceLast} Tagen`}
        />
        <Row k="Tage in Folge" v={`${load.consecutiveDays} Tag${load.consecutiveDays !== 1 ? "e" : ""}`} />
        {load.acwr != null && (
          <Row k="ACWR" v={`${load.acwr.toFixed(2)}${acwrLabel ? ` — ${acwrLabel}` : ""}`} vColor={acwrColor} />
        )}
        {load.acute7dTonnage != null && (
          <Row k="Akutlast (7 Tage)" v={`${Math.round(load.acute7dTonnage).toLocaleString("de-DE")} kg`} />
        )}
        {load.chronic28dAvgTonnage != null && (
          <Row k="Chronische Last (28d Ø/Woche)" v={`${Math.round(load.chronic28dAvgTonnage).toLocaleString("de-DE")} kg`} />
        )}
        {load.lastTonnage != null && (
          <Row k="Letztes Workout Tonnage" v={`${Math.round(load.lastTonnage).toLocaleString("de-DE")} kg`} />
        )}
        {load.intensity && <Row k="Intensität" v={intensityLabel} />}
        {consPenalty > 0 && <Row k="Folgetage-Abzug" v={`−${consPenalty}%`} vColor="#FF453A" />}
        <p className="pt-1 text-[11px] leading-relaxed" style={{ color: "#5E5E66" }}>
          ACWR = 7-Tage-Last ÷ 28-Tage-Wochenschnitt. Sweet Spot: 0.85–1.0.
          Richtwerte: 0.5 → 92, 0.85 → 100, 1.15 → 90, 1.30 → 65, 1.50 → 35, 1.70 → 25.
          Werte dazwischen werden linear interpoliert.
          Jeder weitere Tag in Folge senkt den Score zusätzlich um 15% (min. 60%).
          Wenn kein Gewicht geloggt ist, wird die Anzahl der Workouts als Proxy verwendet.
        </p>
      </>
    );
  }
  return <Card icon={<Dumbbell className="h-4 w-4" />} title="Trainingslast (ACWR)" accent="#FFB340" score={score} weight={0.30}>{detail}</Card>;
}

// ── Activity ──────────────────────────────────────────────────────────────────

function ActivityCard({
  score, baseline,
}: {
  score: number | null;
  baseline: RecoveryBreakdown["baseline"];
}) {
  let detail: React.ReactNode;
  if (score == null) {
    detail = <p>Keine Schritte oder aktive Kalorien für heute verfügbar — oder noch zu wenig Vergleichsdaten (≥5 Tage nötig).</p>;
  } else {
    detail = (
      <>
        {baseline.steps != null && (
          <Row
            k={`Persönlicher Ø Schritte (Ø aus ${baseline.stepsDays} Tag${baseline.stepsDays !== 1 ? "en" : ""})`}
            v={Math.round(baseline.steps).toLocaleString("de-DE")}
          />
        )}
        {baseline.activeCalories != null && (
          <Row
            k={`Persönlicher Ø Aktivkalorien (Ø aus ${baseline.calDays} Tag${baseline.calDays !== 1 ? "en" : ""})`}
            v={`${Math.round(baseline.activeCalories)} kcal`}
          />
        )}
        <p className="pt-1 text-[11px] leading-relaxed" style={{ color: "#5E5E66" }}>
          Hohe Tagesaktivität (Schritte + aktive Kalorien deutlich über dem Schnitt)
          bedeutet zusätzliche Belastung. Richtwerte (Anteil vom persönlichen Median):
          ≤70% → 100, 100% → 88, 130% → 75, 160% → 58, ≥200% → 40.
          Werte dazwischen werden linear interpoliert.
        </p>
      </>
    );
  }
  return <Card icon={<Footprints className="h-4 w-4" />} title="Tagesaktivität" accent="#64D2FF" score={score} weight={0.10}>{detail}</Card>;
}
