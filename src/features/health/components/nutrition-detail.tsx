"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "@/components/app-link";
import { ArrowLeft, Flame, TrendingDown, TrendingUp } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import type { HealthSnapshot } from "../types";
import {
  CALORIE_TARGET_DEFAULT,
  MACRO_TARGETS,
  SECONDARY_TARGETS,
  MICRO_TARGETS,
  type NutrientTarget,
} from "../nutrition-config";

export function NutritionDetail({
  initialSnapshot,
}: {
  /** Server-prefetched data — skips the client fetch when provided. */
  initialSnapshot?: HealthSnapshot | null;
} = {}) {
  const hasInitialData = initialSnapshot !== undefined;
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(initialSnapshot ?? null);
  const [loading, setLoading] = useState(!hasInitialData);

  useEffect(() => {
    if (hasInitialData) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/health-data?limit=1", { credentials: "include" });
      if (!res.ok) { if (!cancelled) setLoading(false); return; }
      const json = (await res.json()) as { data: HealthSnapshot[] };
      if (!cancelled) {
        setSnapshot(json.data[json.data.length - 1] ?? null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hasInitialData]);

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
      <Back />

      <div>
        <h1 className="text-[28px] font-bold text-white">Ernährung</h1>
        <p className="mt-1 text-[13px]" style={{ color: "#9A9AA2" }}>
          Heute · Daten aus Apple Health
        </p>
      </div>

      <CalorieBalance snapshot={snapshot} />
      <MacroSection snapshot={snapshot} />
      <SecondarySection snapshot={snapshot} />
      <MicroSection snapshot={snapshot} />
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

// ── Calorie balance hero ─────────────────────────────────────────────────────

function CalorieBalance({ snapshot }: { snapshot: HealthSnapshot | null }) {
  const eaten = snapshot?.dietaryCalories ?? null;
  const active = snapshot?.activeCalories ?? null;
  const basal = snapshot?.calories ?? null;
  const burned = (active ?? 0) + (basal ?? 0);
  const burnedKnown = active != null || basal != null;
  const net = eaten != null && burnedKnown ? Math.round(eaten - burned) : null;

  const target = CALORIE_TARGET_DEFAULT;
  const pct = eaten != null ? Math.min(100, Math.round((eaten / target) * 100)) : 0;

  const inDeficit = net != null && net < 0;
  const inSurplus = net != null && net > 0;

  return (
    <div className="rounded-[22px] p-5" style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center gap-2 mb-1">
        <Flame className="h-4 w-4" style={{ color: "#FF9F0A" }} />
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#9A9AA2" }}>
          Kalorien
        </p>
      </div>

      {eaten == null ? (
        <p className="mt-3 text-[13px]" style={{ color: "#5E5E66" }}>
          Noch keine Kalorien-Einträge in Apple Health.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-1">
            <span className="text-[36px] font-bold leading-none text-white tabular-nums">
              {Math.round(eaten).toLocaleString("de-DE")}
            </span>
            <span className="text-[15px]" style={{ color: "#9A9AA2" }}>
              / {target.toLocaleString("de-DE")} kcal
            </span>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div
              className="h-full transition-all"
              style={{ width: `${pct}%`, background: "#FF9F0A" }}
            />
          </div>

          {burnedKnown && (
            <div className="mt-4 grid grid-cols-3 gap-2 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <BalanceCell label="Gegessen" value={Math.round(eaten)} color="#FF9F0A" />
              <BalanceCell label="Verbraucht" value={Math.round(burned)} color="#64D2FF" />
              <BalanceCell
                label={net! < 0 ? "Defizit" : "Überschuss"}
                value={Math.abs(net!)}
                color={inDeficit ? "#30D158" : inSurplus ? "#FF9F0A" : "#9A9AA2"}
                icon={inDeficit ? <TrendingDown className="h-3 w-3" /> : inSurplus ? <TrendingUp className="h-3 w-3" /> : null}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BalanceCell({
  label, value, color, icon,
}: {
  label: string; value: number; color: string; icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "#5E5E66" }}>{label}</p>
      <p className="mt-0.5 flex items-center gap-1 text-[16px] font-bold tabular-nums" style={{ color }}>
        {icon}
        {value.toLocaleString("de-DE")}
        <span className="text-[10px] font-normal" style={{ color: "#5E5E66" }}>kcal</span>
      </p>
    </div>
  );
}

// ── Macro section ────────────────────────────────────────────────────────────

function MacroSection({ snapshot }: { snapshot: HealthSnapshot | null }) {
  return (
    <Section title="Makronährstoffe" subtitle="Tagesziele für Sportler">
      {MACRO_TARGETS.map((t) => (
        <NutrientRow
          key={t.key}
          target={t.key === "carbs" ? { ...t, target: dynamicCarbTarget(snapshot) } : t}
          value={snapshot ? toNumberOrNull(snapshot[t.key as keyof HealthSnapshot]) : null}
        />
      ))}
    </Section>
  );
}

// ── Secondary nutrients (fiber, sugar, sodium, water) ────────────────────────

function SecondarySection({ snapshot }: { snapshot: HealthSnapshot | null }) {
  const visible = SECONDARY_TARGETS.filter((t) => {
    if (!snapshot) return true;
    const v = toNumberOrNull(snapshot[t.key as keyof HealthSnapshot]);
    return v != null;
  });

  if (visible.length === 0) return null;

  return (
    <Section title="Weitere Nährstoffe">
      {visible.map((t) => (
        <NutrientRow
          key={t.key}
          target={t}
          value={snapshot ? toNumberOrNull(snapshot[t.key as keyof HealthSnapshot]) : null}
        />
      ))}
    </Section>
  );
}

// ── Micronutrients ───────────────────────────────────────────────────────────

function MicroSection({ snapshot }: { snapshot: HealthSnapshot | null }) {
  const visible = MICRO_TARGETS.filter((t) => {
    if (!snapshot) return false;
    const v = toNumberOrNull(snapshot[t.key as keyof HealthSnapshot]);
    return v != null;
  });

  if (visible.length === 0) {
    return (
      <Section title="Mikronährstoffe">
        <p className="text-[12px]" style={{ color: "#5E5E66" }}>
          Keine Mikronährstoff-Daten in Apple Health.
          Diese Daten werden meist erst eingetragen wenn du eine Tracking-App wie MyFitnessPal oder Cronometer nutzt.
        </p>
      </Section>
    );
  }

  return (
    <Section title="Mikronährstoffe" subtitle="Anteil am Tagesbedarf (RDA)">
      {visible.map((t) => (
        <NutrientRow
          key={t.key}
          target={t}
          value={snapshot ? toNumberOrNull(snapshot[t.key as keyof HealthSnapshot]) : null}
        />
      ))}
    </Section>
  );
}

// ── Building blocks ──────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[22px] p-4" style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="mb-3">
        <p className="text-[15px] font-semibold text-white">{title}</p>
        {subtitle && <p className="text-[11px]" style={{ color: "#5E5E66" }}>{subtitle}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function NutrientRow({ target, value }: { target: NutrientTarget; value: number | null }) {
  const decimals = target.decimals ?? 0;
  const display = value != null ? value.toFixed(decimals) : "—";

  const pct = value != null ? (value / target.target) * 100 : 0;
  const displayPct = Math.min(100, Math.max(0, pct));

  // For "limit" nutrients (sugar, sodium), being OVER target is bad.
  // For "reach" nutrients, being UNDER target means goal not met yet.
  const overLimit = target.direction === "limit" && pct > 100;
  const reached = target.direction === "reach" && pct >= 100;
  const barColor = overLimit ? "#FF453A" : reached ? "#30D158" : target.color;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[13px] text-white">{target.label}</span>
        <span className="text-[12px] tabular-nums" style={{ color: overLimit ? "#FF453A" : "#9A9AA2" }}>
          <span className="font-semibold text-white">{display}</span>
          {" / "}
          {target.target.toLocaleString("de-DE")} {target.unit}
          {value != null && (
            <span className="ml-1" style={{ color: overLimit ? "#FF453A" : reached ? "#30D158" : "#5E5E66" }}>
              · {Math.round(pct)}%
            </span>
          )}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full transition-all"
          style={{ width: `${displayPct}%`, background: barColor }}
        />
      </div>
      {target.description && (
        <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "#5E5E66" }}>
          {target.description}
        </p>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNumberOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

// Carb target = (remaining calories after protein + fat) / 4 kcal/g
function dynamicCarbTarget(snapshot: HealthSnapshot | null): number {
  // Default fallback — keep it simple so user always sees a target
  void snapshot;
  return 275;
}
