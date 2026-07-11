"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/app-link";
import dynamic from "next/dynamic";
import {
  ArrowLeft, Activity, Clock, Route, Flame, TrendingUp, TrendingDown,
  Heart, MapPin, Mountain, Sun, Home, ChevronDown, Trash2,
} from "lucide-react";
import { ROUTES } from "@/lib/constants";
import type {
  CardioSummary, CardioSession, CardioCategoryGroup, CardioWeekPoint,
} from "../cardio";
import { getWorkoutTypeMeta } from "../cardio-config";

const VolumeChart = dynamic(
  () => import("./cardio-volume-chart").then((m) => m.CardioVolumeChart),
  { ssr: false, loading: () => <div className="h-44 animate-pulse rounded-xl bg-white/5" /> },
);

export function CardioDetail({ summary }: { summary: CardioSummary }) {
  const { outdoor, indoor } = summary;
  const router = useRouter();

  // Client-side hide for instant feedback — the delete is a soft-delete
  // server-side (see /api/health/cardio/[id]), so a router.refresh() alone
  // would still show the row until the new server data lands. Weekly
  // stats/type breakdown only catch up after that refresh, not instantly —
  // acceptable since those are aggregates, not the row itself.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  async function deleteSession(id: string) {
    if (!confirm("Diese Einheit wirklich löschen? Sie verschwindet dauerhaft aus FitTrack.")) return;
    setHiddenIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/health/cardio/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        window.alert("Löschen fehlgeschlagen.");
        return;
      }
      router.refresh();
    } catch {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      window.alert("Löschen fehlgeschlagen.");
    }
  }

  const hasOutdoor =
    outdoor.thisWeek.sessions > 0 ||
    outdoor.lastWeek.sessions > 0 ||
    outdoor.recentSessions.length > 0;
  const hasIndoor =
    indoor.thisWeek.sessions > 0 ||
    indoor.lastWeek.sessions > 0 ||
    indoor.recentSessions.length > 0;

  return (
    <div className="space-y-4 pb-8">
      <Back />

      <div>
        <h1 className="text-[28px] font-bold text-white">Cardio</h1>
        <p className="mt-1 text-[13px]" style={{ color: "#9A9AA2" }}>
          Ausdauertraining · letzte 8 Wochen
        </p>
      </div>

      {!hasOutdoor && !hasIndoor ? (
        <EmptyState />
      ) : (
        <>
          {hasOutdoor && (
            <CategoryBlock
              label="Outdoor"
              accentColor="#30D158"
              icon={<Sun className="h-4 w-4" />}
              metric="distance"
              group={outdoor}
              hiddenIds={hiddenIds}
              onDeleteSession={deleteSession}
            />
          )}

          {hasIndoor && (
            <CategoryBlock
              label="Indoor"
              accentColor="#64D2FF"
              icon={<Home className="h-4 w-4" />}
              metric="time"
              group={indoor}
              hiddenIds={hiddenIds}
              onDeleteSession={deleteSession}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Category block (Outdoor or Indoor) ───────────────────────────────────────

function CategoryBlock({
  label, accentColor, icon, metric, group, hiddenIds, onDeleteSession,
}: {
  label: string;
  accentColor: string;
  icon: React.ReactNode;
  /** Which metric is the headline KPI — distance for outdoor, time for indoor */
  metric: "distance" | "time";
  group: CardioCategoryGroup;
  hiddenIds: Set<string>;
  onDeleteSession: (id: string) => void;
}) {
  const { thisWeek, lastWeek, weeklyHistory, typeBreakdown } = group;
  const recentSessions = group.recentSessions.filter((s) => !hiddenIds.has(s.id));

  const deltaDistPct = lastWeek.distanceKm > 0
    ? ((thisWeek.distanceKm - lastWeek.distanceKm) / lastWeek.distanceKm) * 100
    : null;
  const deltaTimePct = lastWeek.durationMin > 0
    ? ((thisWeek.durationMin - lastWeek.durationMin) / lastWeek.durationMin) * 100
    : null;
  const deltaSessionsPct = lastWeek.sessions > 0
    ? ((thisWeek.sessions - lastWeek.sessions) / lastWeek.sessions) * 100
    : null;

  return (
    <section className="space-y-3">
      <CategoryHeader label={label} icon={icon} color={accentColor} />

      <Hero
        accentColor={accentColor}
        metric={metric}
        thisWeek={thisWeek}
        deltaDistPct={deltaDistPct}
        deltaTimePct={deltaTimePct}
        deltaSessionsPct={deltaSessionsPct}
      />

      <Section title={metric === "distance" ? "Wochenvolumen" : "Wochenzeit"}
               subtitle={`${metric === "distance" ? "Distanz" : "Trainingszeit"} · letzte 8 Wochen`}>
        <div className="h-44 -ml-2">
          <VolumeChart data={weeklyHistory} metric={metric} accent={accentColor} />
        </div>
      </Section>

      {typeBreakdown.length > 0 && (
        <Section title="Diese Woche" subtitle={`${typeBreakdown.length} Sportart${typeBreakdown.length === 1 ? "" : "en"}`}>
          <div className="space-y-2.5">
            {typeBreakdown.map((t) => (
              <TypeRow
                key={t.type}
                type={t.type}
                count={t.count}
                distanceKm={t.distanceKm}
                durationMin={t.durationMin}
                showDistance={metric === "distance"}
              />
            ))}
          </div>
        </Section>
      )}

      {recentSessions.length > 0 && (
        <CollapsibleSection
          title="Verlauf"
          subtitle={`${recentSessions.length} Session${recentSessions.length === 1 ? "" : "s"} · letzte 30 Tage`}
          // Auto-expand when there are very few sessions, otherwise keep tight.
          defaultOpen={recentSessions.length <= 3}
        >
          <div className="space-y-2">
            {recentSessions.map((s) => (
              <SessionRow key={s.id} session={s} metric={metric} onDelete={() => onDeleteSession(s.id)} />
            ))}
          </div>
        </CollapsibleSection>
      )}
    </section>
  );
}

function CategoryHeader({ label, icon, color }: { label: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span style={{ color }}>{icon}</span>
      <h2 className="text-[18px] font-bold text-white">{label}</h2>
      <div className="ml-2 h-px flex-1" style={{ background: `linear-gradient(to right, ${color}40, transparent)` }} />
    </div>
  );
}

// ── Reusable atoms ───────────────────────────────────────────────────────────

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

function CollapsibleSection({
  title, subtitle, children, defaultOpen = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-[22px]" style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-[22px] p-4 text-left transition-colors active:bg-white/5"
      >
        <div>
          <p className="text-[15px] font-semibold text-white">{title}</p>
          {subtitle && <p className="text-[11px]" style={{ color: "#5E5E66" }}>{subtitle}</p>}
        </div>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform"
          style={{ color: "#9A9AA2", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1">
          {children}
        </div>
      )}
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

// ── Hero ─────────────────────────────────────────────────────────────────────

function Hero({
  accentColor, metric, thisWeek, deltaDistPct, deltaTimePct, deltaSessionsPct,
}: {
  accentColor: string;
  metric: "distance" | "time";
  thisWeek: CardioSummary["outdoor"]["thisWeek"];
  deltaDistPct: number | null;
  deltaTimePct: number | null;
  deltaSessionsPct: number | null;
}) {
  // For indoor we hide distance entirely (it's not meaningful without GPS)
  const showDistance = metric === "distance";

  return (
    <div
      className="overflow-hidden rounded-[22px] p-5"
      style={{
        background: `linear-gradient(135deg, ${accentColor}14 0%, #121214 60%)`,
        border: `1px solid ${accentColor}30`,
      }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide mb-3" style={{ color: accentColor }}>
        Diese Woche
      </p>

      <div className={`grid gap-4 ${showDistance ? "grid-cols-3" : "grid-cols-3"}`}>
        <HeroStat
          icon={<Activity className="h-3.5 w-3.5" />}
          label="Sessions"
          value={thisWeek.sessions.toString()}
          delta={deltaSessionsPct}
          accentColor={accentColor}
        />
        {showDistance ? (
          <HeroStat
            icon={<Route className="h-3.5 w-3.5" />}
            label="Distanz"
            value={thisWeek.distanceKm.toFixed(1)}
            unit="km"
            delta={deltaDistPct}
            accentColor={accentColor}
          />
        ) : (
          <HeroStat
            icon={<Flame className="h-3.5 w-3.5" />}
            label="Kalorien"
            value={Math.round(thisWeek.activeCalories).toLocaleString("de-DE")}
            unit="kcal"
            accentColor={accentColor}
          />
        )}
        <HeroStat
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Zeit"
          value={Math.round(thisWeek.durationMin).toString()}
          unit="min"
          delta={deltaTimePct}
          accentColor={accentColor}
        />
      </div>

      {/* For outdoor: also show calories as a footer chip. For indoor: distance is hidden everywhere. */}
      {showDistance && thisWeek.activeCalories > 0 && (
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
  icon, label, value, unit, delta, accentColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  delta?: number | null;
  accentColor: string;
}) {
  const showDelta = delta != null && Math.abs(delta) >= 1;
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide" style={{ color: "#5E5E66" }}>
        <span style={{ color: accentColor }}>{icon}</span>
        {label}
      </div>
      <p className="mt-1 flex items-baseline gap-1">
        <span className="text-[26px] font-bold leading-none tabular-nums text-white">{value}</span>
        {unit && <span className="text-[12px]" style={{ color: "#9A9AA2" }}>{unit}</span>}
      </p>
      {showDelta && (
        <p
          className="mt-1 flex items-center gap-0.5 text-[10px] font-semibold tabular-nums"
          style={{ color: delta > 0 ? "#30D158" : "#FF9F0A" }}
        >
          {delta > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
          {delta > 0 ? "+" : ""}
          {delta.toFixed(0)}%
        </p>
      )}
    </div>
  );
}

// ── Type breakdown row ───────────────────────────────────────────────────────

function TypeRow({
  type, count, distanceKm, durationMin, showDistance,
}: {
  type: string; count: number; distanceKm: number; durationMin: number; showDistance: boolean;
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
          {showDistance && distanceKm > 0 && ` · ${distanceKm.toFixed(1)} km`}
        </p>
      </div>
    </div>
  );
}

// ── Session row ──────────────────────────────────────────────────────────────

function SessionRow({
  session, metric, onDelete,
}: {
  session: CardioSession;
  metric: "distance" | "time";
  onDelete: () => void;
}) {
  const meta = getWorkoutTypeMeta(session.type);
  const Icon = meta.icon;
  const date = useMemo(() => new Date(session.startedAt), [session.startedAt]);

  const pace = session.distanceKm && session.distanceKm > 0
    ? session.durationMin / session.distanceKm
    : null;

  // Indoor sessions don't get distance/pace fields rendered (mostly noise).
  const showDistanceFields = metric === "distance" && session.distanceKm != null && session.distanceKm > 0;

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
          <div className="flex shrink-0 items-center gap-2">
            <p className="text-[11px] tabular-nums" style={{ color: "#9A9AA2" }}>
              {date.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })}{" "}
              · {date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Einheit löschen"
              className="rounded-md p-1 text-muted-foreground/60 transition-colors hover:text-destructive active:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums" style={{ color: "#9A9AA2" }}>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {Math.round(session.durationMin)} min
          </span>
          {showDistanceFields && (
            <span className="flex items-center gap-1">
              <Route className="h-3 w-3" />
              {session.distanceKm!.toFixed(2)} km
            </span>
          )}
          {showDistanceFields && pace != null && pace > 0 && pace < 30 && (
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
          {showDistanceFields && session.elevationGainM != null && session.elevationGainM > 5 && (
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
