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
            Noch keine Recovery-Daten. Schlaf, HRV oder Ruhepuls in Apple Health eintragen.
          </p>
        </div>
      </div>
    );
  }

  const color =
    recovery.level === "high" ? "#D4FF3A"
    : recovery.level === "mid" ? "#FFB340"
    : "#FF453A";

  const levelLabel =
    recovery.level === "high" ? "Ready to Train"
    : recovery.level === "mid" ? "Moderate"
    : "Rest Day";

  return (
    <div className="space-y-4 pb-8">
      <Back />

      <div>
        <h1 className="text-[28px] font-bold text-white">Recovery</h1>
        <p className="mt-1 text-[15px] font-semibold" style={{ color }}>
          {recovery.score} / 100 · {levelLabel}
        </p>
      </div>

      <HistoryChart history={history} />

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
        <p className="text-[13px]" style={{ color: "#5E5E66" }}>
          Verlauf erscheint nach einigen Tagen.
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
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#9A9AA2" }}>
          Verlauf · {history.length} Tage
        </p>
        <p className="text-[12px]" style={{ color: "#9A9AA2" }}>
          Ø <span className="font-semibold text-white">{avg}</span>
        </p>
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

function Card({ icon, title, accent, children, score, weight, hint }: {
  icon: React.ReactNode;
  title: string;
  accent: string;
  children: React.ReactNode;
  score: number | null;
  weight: number;
  hint?: string;
}) {
  return (
    <div className="rounded-[22px] p-4" style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span style={{ color: accent }}>{icon}</span>
          <div>
            <p className="text-[15px] font-semibold text-white">{title}</p>
            <p className="text-[11px]" style={{ color: "#5E5E66" }}>{Math.round(weight * 100)}% Gewicht</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[20px] font-bold leading-none" style={{ color: score != null ? accent : "#5E5E66" }}>
            {score != null ? Math.round(score) : "—"}
          </p>
          <p className="text-[10px]" style={{ color: "#5E5E66" }}>/100</p>
        </div>
      </div>
      <div className="space-y-1.5 text-[13px]" style={{ color: "#9A9AA2" }}>
        {children}
      </div>
      {hint && (
        <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "#5E5E66" }}>
          {hint}
        </p>
      )}
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
  const arrow = rising ? "↑" : "↓";
  return (
    <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${color}22`, color }}>
      {arrow} {good ? "positiv" : "Warnsignal"}
    </span>
  );
}

// ── Sleep ───────────────────────────────────────────────────────────────────

function SleepCard({ score }: { score: number | null }) {
  return (
    <Card
      icon={<Moon className="h-4 w-4" />}
      title="Schlaf"
      accent="#6E5BFF"
      score={score}
      weight={0.20}
      hint="7–8 Std. sind der Sweet Spot für Muskelregeneration und Hormonbalance."
    >
      {score == null && <p>Keine Schlafdaten für heute.</p>}
    </Card>
  );
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
  return (
    <Card
      icon={<Heart className="h-4 w-4" />}
      title="Ruhepuls"
      accent="#FF453A"
      score={score}
      weight={0.15}
      hint="Niedriger ist besser. Anstiege über mehrere Tage deuten auf Erschöpfung oder beginnende Krankheit hin."
    >
      {score == null ? (
        <p>Kein Ruhepuls für heute verfügbar.</p>
      ) : baseline != null ? (
        <>
          <div className="flex items-center justify-between">
            <span>Baseline · Ø {daysOfData} {daysOfData === 1 ? "Tag" : "Tage"}</span>
            <span className="font-medium text-white">{baseline.toFixed(0)} bpm</span>
          </div>
          {trend && trend !== "stable" && (
            <div className="flex justify-end">
              <TrendBadge trend={trend} invert />
            </div>
          )}
        </>
      ) : (
        <p>
          {daysOfData === 0
            ? "Noch keine Ruhepuls-Daten gesammelt."
            : <>Erst <span className="text-white font-medium">{daysOfData} {daysOfData === 1 ? "Tag" : "Tage"}</span> Daten — persönliche Baseline ab 8 Tagen. Solange feste Schwellen.</>
          }
        </p>
      )}
    </Card>
  );
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
  return (
    <Card
      icon={<Zap className="h-4 w-4" />}
      title="HRV"
      accent="#30D158"
      score={score}
      weight={0.25}
      hint="Höher ist besser. Sinkt sie mehrere Tage in Folge, ist das ein frühes Übertraining-Signal."
    >
      {score == null ? (
        <p>Keine HRV für heute verfügbar.</p>
      ) : baseline != null ? (
        <>
          <div className="flex items-center justify-between">
            <span>Baseline · Ø {daysOfData} {daysOfData === 1 ? "Tag" : "Tage"}</span>
            <span className="font-medium text-white">{baseline.toFixed(0)} ms</span>
          </div>
          {trend && trend !== "stable" && (
            <div className="flex justify-end">
              <TrendBadge trend={trend} />
            </div>
          )}
        </>
      ) : (
        <p>
          {daysOfData === 0
            ? "Noch keine HRV-Daten gesammelt."
            : <>Erst <span className="text-white font-medium">{daysOfData} {daysOfData === 1 ? "Tag" : "Tage"}</span> Daten — persönliche Baseline ab 8 Tagen. Solange feste Schwellen.</>
          }
        </p>
      )}
    </Card>
  );
}

// ── Training Load ─────────────────────────────────────────────────────────────

function LoadCard({
  score, load,
}: {
  score: number | null;
  load: RecoveryBreakdown["trainingLoad"];
}) {
  if (load.daysSinceLast == null) {
    return (
      <Card
        icon={<Dumbbell className="h-4 w-4" />}
        title="Trainingslast"
        accent="#FFB340"
        score={score}
        weight={0.30}
      >
        <p>Keine Workouts in den letzten 28 Tagen — voll erholt.</p>
      </Card>
    );
  }

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
    : load.acwr < 1.0 ? "Optimal"
    : load.acwr < 1.3 ? "Leicht erhöht"
    : load.acwr < 1.5 ? "Spike — Risiko"
    : "Gefahrenzone";

  const consPenalty = load.consecutiveDays >= 2
    ? Math.round((1 - Math.max(0.60, 1 - (load.consecutiveDays - 1) * 0.15)) * 100)
    : 0;

  return (
    <Card
      icon={<Dumbbell className="h-4 w-4" />}
      title="Trainingslast"
      accent="#FFB340"
      score={score}
      weight={0.30}
      hint="ACWR = Last der letzten 7 Tage geteilt durch deinen 28-Tage-Wochenschnitt. Sweet Spot 0.85–1.30."
    >
      <Row
        k="Letztes Training"
        v={load.daysSinceLast === 0 ? "heute" : load.daysSinceLast === 1 ? "gestern" : `vor ${load.daysSinceLast} Tagen`}
      />
      {load.consecutiveDays >= 2 && (
        <Row k="In Folge" v={`${load.consecutiveDays} Tage`} />
      )}
      {load.acwr != null && (
        <Row k="ACWR" v={`${load.acwr.toFixed(2)} · ${acwrLabel}`} vColor={acwrColor} />
      )}
      {load.intensity && (
        <Row
          k="Intensität"
          v={load.intensity === "high" ? "intensiv" : load.intensity === "low" ? "leicht" : "mittel"}
        />
      )}
      {consPenalty > 0 && (
        <Row k="Folgetage-Abzug" v={`−${consPenalty}%`} vColor="#FF453A" />
      )}
    </Card>
  );
}

// ── Activity ──────────────────────────────────────────────────────────────────

function ActivityCard({
  score, baseline,
}: {
  score: number | null;
  baseline: RecoveryBreakdown["baseline"];
}) {
  return (
    <Card
      icon={<Footprints className="h-4 w-4" />}
      title="Tagesaktivität"
      accent="#64D2FF"
      score={score}
      weight={0.10}
      hint="Schritte + aktive Kalorien deutlich über deinem Schnitt zählen als zusätzliche Belastung."
    >
      {score == null ? (
        <p>Noch zu wenig Vergleichsdaten (≥6 Tage gesamt nötig).</p>
      ) : (
        <>
          {baseline.steps != null && (
            <Row
              k={`Ø Schritte (${baseline.stepsDays}d)`}
              v={Math.round(baseline.steps).toLocaleString("de-DE")}
            />
          )}
          {baseline.activeCalories != null && (
            <Row
              k={`Ø Kalorien (${baseline.calDays}d)`}
              v={`${Math.round(baseline.activeCalories)} kcal`}
            />
          )}
        </>
      )}
    </Card>
  );
}
