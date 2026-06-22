"use client";

import Link from "next/link";
import { Activity, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import type { CardioSummary } from "../cardio";
import { getWorkoutTypeMeta } from "../cardio-config";

/**
 * Compact cardio summary for the health dashboard.
 * Hides itself entirely when the user has no workouts in the current or
 * previous week — no point showing empty state if they don't do cardio.
 */
export function CardioCard({ summary }: { summary: CardioSummary }) {
  const { thisWeek, lastWeek, typeBreakdown } = summary;

  if (thisWeek.sessions === 0 && lastWeek.sessions === 0) return null;

  const deltaDist = thisWeek.distanceKm - lastWeek.distanceKm;
  const deltaDistPct = lastWeek.distanceKm > 0
    ? (deltaDist / lastWeek.distanceKm) * 100
    : null;

  return (
    <Link
      href={`${ROUTES.health}/cardio`}
      className="block space-y-3 rounded-[22px] p-5 transition-colors active:bg-white/5"
      style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4" style={{ color: "#64D2FF" }} />
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#9A9AA2" }}>
            Cardio · Diese Woche
          </p>
        </div>
        <ChevronRight className="h-4 w-4" style={{ color: "#5E5E66" }} />
      </div>

      {thisWeek.sessions === 0 ? (
        <p className="text-[13px]" style={{ color: "#5E5E66" }}>
          Diese Woche noch kein Cardio. Letzte Woche: {lastWeek.sessions} Session
          {lastWeek.sessions === 1 ? "" : "s"}, {lastWeek.distanceKm.toFixed(1)} km
        </p>
      ) : (
        <>
          {/* Three big stats */}
          <div className="grid grid-cols-3 gap-3">
            <Stat
              label="Sessions"
              value={thisWeek.sessions.toString()}
              accent="#64D2FF"
            />
            <Stat
              label="Distanz"
              value={thisWeek.distanceKm.toFixed(1)}
              unit="km"
              accent="#64D2FF"
            />
            <Stat
              label="Zeit"
              value={Math.round(thisWeek.durationMin).toString()}
              unit="min"
              accent="#64D2FF"
            />
          </div>

          {/* Delta chip */}
          {deltaDistPct !== null && Math.abs(deltaDistPct) >= 1 && (
            <div
              className="flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{
                background: deltaDistPct > 0 ? "rgba(48,209,88,0.15)" : "rgba(255,159,10,0.15)",
                color: deltaDistPct > 0 ? "#30D158" : "#FF9F0A",
              }}
            >
              {deltaDistPct > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {deltaDistPct > 0 ? "+" : ""}
              {deltaDistPct.toFixed(0)}% vs. letzte Woche
            </div>
          )}

          {/* Type pills */}
          {typeBreakdown.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {typeBreakdown.slice(0, 4).map((t) => {
                const meta = getWorkoutTypeMeta(t.type);
                const Icon = meta.icon;
                return (
                  <span
                    key={t.type}
                    className="mt-2 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]"
                    style={{ background: "rgba(255,255,255,0.06)", color: "#C0C0C8" }}
                  >
                    <Icon className="h-3 w-3" style={{ color: meta.color }} />
                    {meta.label} · {t.count}×
                  </span>
                );
              })}
            </div>
          )}
        </>
      )}
    </Link>
  );
}

function Stat({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "#5E5E66" }}>
        {label}
      </p>
      <p className="mt-0.5 flex items-baseline gap-1">
        <span className="text-[22px] font-bold leading-none tabular-nums" style={{ color: accent }}>
          {value}
        </span>
        {unit && <span className="text-[11px]" style={{ color: "#9A9AA2" }}>{unit}</span>}
      </p>
    </div>
  );
}

