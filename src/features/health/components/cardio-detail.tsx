"use client";

import { useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft, Activity, Clock, Route, Flame, TrendingUp, TrendingDown,
  Heart, MapPin, Mountain,
} from "lucide-react";
import { ROUTES } from "@/lib/constants";
import type { CardioSummary, CardioSession } from "../cardio";
import { getWorkoutTypeMeta } from "../cardio-config";

const WeeklyVolumeChart = dynamic(
  () => import("./cardio-volume-chart").then((m) => m.CardioVolumeChart),
  { ssr: false, loading: () => <div className="h-44 animate-pulse rounded-xl bg-white/5" /> },
);

export function CardioDetail({ summary }: { summary: CardioSummary }) {
  const { thisWeek, lastWeek, weeklyHistory, typeBreakdown, recentSessions } = summary;

  const deltaDist = thisWeek.distanceKm - lastWeek.distanceKm;
  const deltaDistPct = lastWeek.distanceKm > 0 ? (deltaDist / lastWeek.distanceKm) * 100 : null;
  const deltaTime = thisWeek.durationMin - lastWeek.durationMin;
  const deltaTimePct = lastWeek.durationMin > 0 ? (deltaTime / lastWeek.durationMin) * 100 : null;

  const hasAnyData = recentSessions.length > 0 || thisWeek.sessions > 0 || lastWeek.sessions > 0;

  return (
    <div className="space-y-4 pb-8">
      <Back />

      <div>
        <h1 className="text-[28px] font-bold text-white">Cardio</h1>
        <p className="mt-1 text-[13px]" style={{ color: "#9A9AA2" }}>
          Ausdauertraining · letzte 8 Wochen
        </p>
      </div>

      {!hasAnyData ? (
        <EmptyState />
      ) : (
        <>
          {/* Hero — this week summary */}
          <HeroCard
            thisWeek={thisWeek}
            deltaDistPct={deltaDistPct}
            deltaTimePct={deltaTimePct}
          />

          {/* Weekly volume chart */}
          <Section title="Wochenvolumen" subtitle="Distanz pro Woche · letzte 8 Wochen">
            <div className="h-44 -ml-2">
              <WeeklyVolumeChart data={weeklyHistory} />
            </div>
          </Section>

          {/* Type breakdown for current week */}
          {typeBreakdown.length > 0 && (
            <Section title="Diese Woche" subtitle={`${typeBreakdown.length} Sportart${typeBreakdown.length === 1 ? "" : "en"}`}>
              <div className="space-y-2.5">
                {typeBreakdown.map((t) => (
                  <TypeRow key={t.type} type={t.type} count={t.count} distanceKm={t.distanceKm} durationMin={t.durationMin} />
                ))}
              </div>
            </Section>
          )}

          {/* Recent sessions list */}
          {recentSessions.length > 0 && (
            <Section title="Verlauf" subtitle={`${recentSessions.length} Session${recentSessions.length === 1 ? "" : "s"} · letzte 30 Tage`}>
              <div className="space-y-2">
                {recentSessions.map((s) => (
                  <SessionRow key={s.id} session={s} />
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

// ── Components ───────────────────────────────────────────────────────────────

function Back() {
  return (
    <Link href={ROUTES.health} className="inline-flex items-center gap-1 text-[14px]" style={{ color: "#9A9AA2" }}>
      <ArrowLeft className="h-4 w-4" />
      Gesundheit
    </Link>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[22px] p-4" style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="mb-3">
        <p className="text-[15px] font-semibold text-white">{title}</p>
        {subtitle && <p className="text-[11px]" style={{ color: "#5E5E66" }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-[22px] p-8 text-center"
      style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <Activity className="h-10 w-10" style={{ color: "#64D2FF" }} />
      <div>
        <p className="text-[15px] font-semibold text-white">Noch keine Workouts</p>
        <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "#9A9AA2" }}>
          Aktiviere in Health Auto Export eine zweite Automatisierung mit
          <br />
          <span className="font-medium text-white">Data Type: Workouts</span> →
          gleicher REST-Endpoint. Beim nächsten Sync landen deine Cardio-Sessions hier.
        </p>
      </div>
    </div>
  );
}

function HeroCard({
  thisWeek, deltaDistPct, deltaTimePct,
}: {
  thisWeek: CardioSummary["thisWeek"];
  deltaDistPct: number | null;
  deltaTimePct: number | null;
}) {
  return (
    <div
      className="overflow-hidden rounded-[22px] p-5"
      style={{
        background: "linear-gradient(135deg, #0F1A24 0%, #121214 60%)",
        border: "1px solid rgba(100,210,255,0.18)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4" style={{ color: "#64D2FF" }} />
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#64D2FF" }}>
          Diese Woche
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <HeroStat icon={<Activity className="h-3.5 w-3.5" />} label="Sessions" value={thisWeek.sessions.toString()} />
        <HeroStat
          icon={<Route className="h-3.5 w-3.5" />}
          label="Distanz"
          value={thisWeek.distanceKm.toFixed(1)}
          unit="km"
          delta={deltaDistPct}
        />
        <HeroStat
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Zeit"
          value={Math.round(thisWeek.durationMin).toString()}
          unit="min"
          delta={deltaTimePct}
        />
      </div>

      {thisWeek.activeCalories > 0 && (
        <div className="mt-4 flex items-center gap-2 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <Flame className="h-3.5 w-3.5" style={{ color: "#FF9F0A" }} />
          <span className="text-[12px]" style={{ color: "#9A9AA2" }}>
            <span className="font-semibold text-white tabular-nums">
              {Math.round(thisWeek.activeCalories).toLocaleString("de-DE")}
            </span>{" "}
            kcal aktiv
          </span>
        </div>
      )}
    </div>
  );
}

function HeroStat({
  icon, label, value, unit, delta,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  delta?: number | null;
}) {
  const showDelta = delta !== null && delta !== undefined && Math.abs(delta) >= 1;
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide" style={{ color: "#5E5E66" }}>
        <span style={{ color: "#64D2FF" }}>{icon}</span>
        {label}
      </div>
      <p className="mt-1 flex items-baseline gap-1">
        <span className="text-[26px] font-bold leading-none tabular-nums text-white">{value}</span>
        {unit && <span className="text-[12px]" style={{ color: "#9A9AA2" }}>{unit}</span>}
      </p>
      {showDelta && (
        <p
          className="mt-1 flex items-center gap-0.5 text-[10px] font-semibold tabular-nums"
          style={{ color: delta! > 0 ? "#30D158" : "#FF9F0A" }}
        >
          {delta! > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
          {delta! > 0 ? "+" : ""}
          {delta!.toFixed(0)}%
        </p>
      )}
    </div>
  );
}

function TypeRow({
  type, count, distanceKm, durationMin,
}: {
  type: string; count: number; distanceKm: number; durationMin: number;
}) {
  const meta = getWorkoutTypeMeta(type);
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${meta.color}1A` }}
      >
        <Icon className="h-4 w-4" style={{ color: meta.color }} />
      </div>
      <div className="flex-1">
        <p className="text-[14px] font-semibold text-white">{meta.label}</p>
        <p className="text-[11px] tabular-nums" style={{ color: "#9A9AA2" }}>
          {count}× · {Math.round(durationMin)} min
          {distanceKm > 0 && ` · ${distanceKm.toFixed(1)} km`}
        </p>
      </div>
    </div>
  );
}

function SessionRow({ session }: { session: CardioSession }) {
  const meta = getWorkoutTypeMeta(session.type);
  const Icon = meta.icon;
  const date = useMemo(() => new Date(session.startedAt), [session.startedAt]);

  // Pace (min/km) — only for distance-based workouts
  const pace = session.distanceKm && session.distanceKm > 0
    ? session.durationMin / session.distanceKm
    : null;

  return (
    <div
      className="flex items-start gap-3 rounded-xl p-3"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${meta.color}1A` }}
      >
        <Icon className="h-4 w-4" style={{ color: meta.color }} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[14px] font-semibold text-white truncate">{meta.label}</p>
          <p className="shrink-0 text-[11px] tabular-nums" style={{ color: "#9A9AA2" }}>
            {date.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })}{" "}
            · {date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums" style={{ color: "#9A9AA2" }}>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {Math.round(session.durationMin)} min
          </span>
          {session.distanceKm != null && session.distanceKm > 0 && (
            <span className="flex items-center gap-1">
              <Route className="h-3 w-3" />
              {session.distanceKm.toFixed(2)} km
            </span>
          )}
          {pace != null && pace > 0 && pace < 30 && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {formatPace(pace)} /km
            </span>
          )}
          {session.avgHeartRate != null && (
            <span className="flex items-center gap-1">
              <Heart className="h-3 w-3" />
              Ø {session.avgHeartRate}
              {session.maxHeartRate != null && ` / max ${session.maxHeartRate}`} bpm
            </span>
          )}
          {session.activeCalories != null && session.activeCalories > 0 && (
            <span className="flex items-center gap-1">
              <Flame className="h-3 w-3" />
              {Math.round(session.activeCalories)} kcal
            </span>
          )}
          {session.elevationGainM != null && session.elevationGainM > 5 && (
            <span className="flex items-center gap-1">
              <Mountain className="h-3 w-3" />
              {Math.round(session.elevationGainM)} m
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function formatPace(min: number): string {
  const m = Math.floor(min);
  const s = Math.round((min - m) * 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
