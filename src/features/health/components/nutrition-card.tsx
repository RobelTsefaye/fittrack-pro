"use client";

import Link from "@/components/app-link";
import { Flame, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import type { HealthSnapshot } from "../types";
import { CALORIE_TARGET_DEFAULT, MACRO_TARGETS } from "../nutrition-config";

interface NutritionCardProps {
  snapshot: HealthSnapshot;
}

/**
 * Compact nutrition summary shown on the health dashboard.
 * Hides itself entirely if there's no dietary data — no point showing
 * empty progress bars to users who don't track food.
 */
export function NutritionCard({ snapshot }: NutritionCardProps) {
  const eaten = snapshot.dietaryCalories;
  const hasAnyMacro =
    snapshot.protein != null || snapshot.carbs != null || snapshot.fat != null;

  if (eaten == null && !hasAnyMacro) return null;

  const active = snapshot.activeCalories ?? 0;
  const basal = snapshot.calories ?? 0;
  const burned = active + basal;
  const burnedKnown = snapshot.activeCalories != null || snapshot.calories != null;
  const net = eaten != null && burnedKnown ? Math.round(eaten - burned) : null;
  const inDeficit = net != null && net < 0;
  const inSurplus = net != null && net > 0;

  const caloriePct = eaten != null
    ? Math.min(100, Math.round((eaten / CALORIE_TARGET_DEFAULT) * 100))
    : 0;

  return (
    <Link
      href={`${ROUTES.health}/nutrition`}
      className="block space-y-3 rounded-[22px] p-5 transition-colors active:bg-white/5"
      style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4" style={{ color: "#FF9F0A" }} />
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#9A9AA2" }}>
            Ernährung
          </p>
        </div>
        <ChevronRight className="h-4 w-4" style={{ color: "#5E5E66" }} />
      </div>

      {eaten != null ? (
        <>
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1">
              <span className="text-[28px] font-bold leading-none text-white tabular-nums">
                {Math.round(eaten).toLocaleString("de-DE")}
              </span>
              <span className="text-[13px]" style={{ color: "#9A9AA2" }}>
                / {CALORIE_TARGET_DEFAULT.toLocaleString("de-DE")} kcal
              </span>
            </div>
            {net != null && (
              <span
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{
                  background: inDeficit ? "rgba(48,209,88,0.15)" : inSurplus ? "rgba(255,159,10,0.15)" : "rgba(255,255,255,0.06)",
                  color: inDeficit ? "#30D158" : inSurplus ? "#FF9F0A" : "#9A9AA2",
                }}
              >
                {inDeficit ? <TrendingDown className="h-3 w-3" /> : inSurplus ? <TrendingUp className="h-3 w-3" /> : null}
                {net > 0 ? "+" : ""}{net} kcal
              </span>
            )}
          </div>

          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div
              className="h-full transition-all"
              style={{ width: `${caloriePct}%`, background: "#FF9F0A" }}
            />
          </div>
        </>
      ) : (
        <p className="text-[13px]" style={{ color: "#5E5E66" }}>
          Makros verfügbar — keine Kalorien getrackt
        </p>
      )}

      {/* Macro mini-bars */}
      {hasAnyMacro && (
        <div className="grid grid-cols-3 gap-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {MACRO_TARGETS.map((t) => {
            const v = snapshot[t.key as keyof HealthSnapshot];
            const value = typeof v === "number" ? v : null;
            const pct = value != null ? Math.min(100, (value / t.target) * 100) : 0;
            return (
              <div key={t.key} className="space-y-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] uppercase tracking-wide" style={{ color: "#5E5E66" }}>
                    {t.label}
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums text-white">
                    {value != null ? Math.round(value) : "—"}
                    <span className="ml-0.5 text-[9px] font-normal" style={{ color: "#5E5E66" }}>
                      {t.unit}
                    </span>
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div className="h-full transition-all" style={{ width: `${pct}%`, background: t.color }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Link>
  );
}
