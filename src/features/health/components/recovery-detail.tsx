"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Moon, Heart, Zap, Dumbbell, Info } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import type { RecoveryBreakdown } from "../recovery";

export function RecoveryDetail() {
  const [recovery, setRecovery] = useState<RecoveryBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/health/recovery", { credentials: "include" });
      if (!res.ok) {
        if (!cancelled) setLoading(false);
        return;
      }
      const json = (await res.json()) as { data: RecoveryBreakdown };
      if (!cancelled) {
        setRecovery(json.data);
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
        <div
          className="rounded-[22px] p-8 text-center"
          style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
        >
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

      {/* Headline */}
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

      {/* Method explainer */}
      <div
        className="rounded-[18px] p-4"
        style={{ background: "rgba(212,255,58,0.05)", border: "1px solid rgba(212,255,58,0.15)" }}
      >
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#D4FF3A" }} />
          <div>
            <p className="text-[13px] font-semibold text-white">So wird der Score berechnet</p>
            <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "#9A9AA2" }}>
              Vier Faktoren (Schlaf 25%, Ruhepuls 20%, HRV 25%, Trainingslast 30%) werden zu einem Score von 0-100 kombiniert.
              HRV und Ruhepuls werden gegen deine persönliche 14-Tage-Baseline verglichen — fehlt die Baseline (&lt;7 Tage Daten), greifen feste Schwellen.
              Mehrere Trainingstage in Folge senken den Load-Score progressiv (−20% pro Tag, min. 35%).
              Fehlende Faktoren werden automatisch ausgeglichen (Gewichte renormalisiert).
            </p>
            <p className="mt-2 text-[12px]" style={{ color: "#9A9AA2" }}>
              Stufen: <span className="text-white font-semibold">≥75 = Ready</span> · 50-74 = Moderate · &lt;50 = Rest Day
            </p>
          </div>
        </div>
      </div>

      {/* Sub-score sections */}
      <SleepCard score={recovery.sleepScore} />
      <HRCard
        score={recovery.hrScore}
        baseline={recovery.baseline.restingHR}
        daysOfData={recovery.baseline.daysOfData}
      />
      <HRVCard
        score={recovery.hrvScore}
        baseline={recovery.baseline.hrv}
        daysOfData={recovery.baseline.daysOfData}
      />
      <LoadCard score={recovery.loadScore} load={recovery.trainingLoad} />
    </div>
  );
}

function Back() {
  return (
    <Link
      href={ROUTES.health}
      className="inline-flex items-center gap-1 text-[14px]"
      style={{ color: "#9A9AA2" }}
    >
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
    <div
      className="rounded-[22px] p-4"
      style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
    >
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{k}</span>
      <span className="font-medium text-white">{v}</span>
    </div>
  );
}

function SleepCard({ score }: { score: number | null }) {
  let detail: React.ReactNode;
  if (score == null) {
    detail = <p>Keine Schlafdaten für heute.</p>;
  } else {
    const band =
      score === 100 ? "≥ 8 Std." :
      score === 85  ? "7-8 Std." :
      score === 65  ? "6-7 Std." :
      score === 40  ? "5-6 Std." :
                      "< 5 Std.";
    detail = (
      <>
        <Row k="Heute" v={`${band} → ${score}`} />
        <p className="pt-1 text-[11px] leading-relaxed" style={{ color: "#5E5E66" }}>
          Schlaf wird absolut bewertet — 7-8 Stunden sind das objektive Optimum für Regeneration.
          Schwellen: ≥8h → 100, ≥7h → 85, ≥6h → 65, ≥5h → 40, sonst 15.
        </p>
      </>
    );
  }
  return <Card icon={<Moon className="h-4 w-4" />} title="Schlaf" accent="#6E5BFF" score={score} weight={0.3}>{detail}</Card>;
}

function HRCard({ score, baseline, daysOfData }: { score: number | null; baseline: number | null; daysOfData: number }) {
  let detail: React.ReactNode;
  if (score == null) {
    detail = <p>Kein Ruhepuls für heute verfügbar.</p>;
  } else if (baseline != null) {
    detail = (
      <>
        <Row k="Baseline (14 Tage Median)" v={`${baseline.toFixed(0)} bpm`} />
        <p className="pt-1 text-[11px] leading-relaxed" style={{ color: "#5E5E66" }}>
          Niedriger Ruhepuls = bessere Erholung. Verhältnis zu deiner Baseline:
          ≤0.95 → 100, ≤1.0 → 85, ≤1.05 → 65, ≤1.1 → 40, sonst 20.
        </p>
      </>
    );
  } else {
    detail = (
      <>
        <p>Nur <span className="text-white font-medium">{daysOfData} Tage</span> Daten — Baseline braucht ≥7. Fallback auf feste Schwellen.</p>
        <p className="pt-1 text-[11px] leading-relaxed" style={{ color: "#5E5E66" }}>
          Schwellen: ≤50 → 100, ≤60 → 85, ≤70 → 65, ≤80 → 40, sonst 20.
        </p>
      </>
    );
  }
  return <Card icon={<Heart className="h-4 w-4" />} title="Ruhepuls" accent="#FF453A" score={score} weight={0.2}>{detail}</Card>;
}

function HRVCard({ score, baseline, daysOfData }: { score: number | null; baseline: number | null; daysOfData: number }) {
  let detail: React.ReactNode;
  if (score == null) {
    detail = <p>Keine HRV für heute verfügbar.</p>;
  } else if (baseline != null) {
    detail = (
      <>
        <Row k="Baseline (14 Tage Median)" v={`${baseline.toFixed(0)} ms`} />
        <p className="pt-1 text-[11px] leading-relaxed" style={{ color: "#5E5E66" }}>
          Höhere HRV = bessere Erholung. Verhältnis zu deiner Baseline:
          ≥1.1 → 100, ≥1.0 → 85, ≥0.9 → 65, ≥0.8 → 40, sonst 20.
        </p>
      </>
    );
  } else {
    detail = (
      <>
        <p>Nur <span className="text-white font-medium">{daysOfData} Tage</span> Daten — Baseline braucht ≥7. Fallback auf feste Schwellen.</p>
        <p className="pt-1 text-[11px] leading-relaxed" style={{ color: "#5E5E66" }}>
          Schwellen: ≥80 → 100, ≥60 → 85, ≥40 → 65, ≥25 → 40, sonst 20.
        </p>
      </>
    );
  }
  return <Card icon={<Zap className="h-4 w-4" />} title="HRV" accent="#30D158" score={score} weight={0.3}>{detail}</Card>;
}

function LoadCard({
  score,
  load,
}: {
  score: number | null;
  load: { daysSinceLast: number | null; consecutiveDays: number; lastTonnage: number | null; recentAvgTonnage: number | null; intensity: "high" | "medium" | "low" | null };
}) {
  let detail: React.ReactNode;
  if (load.daysSinceLast == null) {
    detail = (
      <>
        <p>Kein Workout in den letzten 14 Tagen — voll erholt.</p>
        <p className="pt-1 text-[11px] leading-relaxed" style={{ color: "#5E5E66" }}>
          Score 100 weil keine Trainingsbelastung.
        </p>
      </>
    );
  } else {
    const intensityLabel =
      load.intensity === "high" ? "intensiv (≥115% des 7-Tage-Schnitts)"
      : load.intensity === "low" ? "leicht (≤85%)"
      : "mittel";

    const penaltyPct = load.consecutiveDays >= 2
      ? Math.round((1 - Math.max(0.35, 1 - (load.consecutiveDays - 1) * 0.2)) * 100)
      : 0;

    detail = (
      <>
        <Row
          k="Letztes Training"
          v={load.daysSinceLast === 0 ? "heute" : load.daysSinceLast === 1 ? "gestern" : `vor ${load.daysSinceLast} Tagen`}
        />
        <Row k="Tage in Folge" v={`${load.consecutiveDays} Tag${load.consecutiveDays !== 1 ? "e" : ""}`} />
        {load.lastTonnage != null && (
          <Row k="Tonnage" v={`${Math.round(load.lastTonnage).toLocaleString("de-DE")} kg`} />
        )}
        {load.recentAvgTonnage != null && (
          <Row k="Ø 7-Tage-Tonnage" v={`${Math.round(load.recentAvgTonnage).toLocaleString("de-DE")} kg`} />
        )}
        {load.intensity && <Row k="Intensität" v={intensityLabel} />}
        {penaltyPct > 0 && (
          <Row k="Müdigkeits-Abzug" v={`−${penaltyPct}%`} />
        )}
        <p className="pt-1 text-[11px] leading-relaxed" style={{ color: "#5E5E66" }}>
          Basis-Matrix (Tage seit letztem Workout × Intensität):
          0d → 30/45/60, 1d → 60/75/85, 2d → 85/92/97, 3d+ → 100 (high/med/low).
          Für jeden weiteren Tag in Folge wird der Score um 20% reduziert (min. 35%).
          Tonnage = Σ(Gewicht × Wiederholungen) aller abgeschlossenen Arbeitssätze.
        </p>
      </>
    );
  }
  return <Card icon={<Dumbbell className="h-4 w-4" />} title="Trainingslast" accent="#FFB340" score={score} weight={0.3}>{detail}</Card>;
}
