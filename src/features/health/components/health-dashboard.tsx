"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/app-link";
import { Capacitor } from "@capacitor/core";
import {
  Moon, Heart, Footprints, Flame, Wind,
  Droplets, Zap, Timer, RefreshCw,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-provider";
import { ROUTES } from "@/lib/constants";
import { type HealthSnapshot, formatSleepDuration } from "../types";
import type { RecoveryBreakdown } from "../recovery";
import { HealthStatPill } from "./health-stat-pill";
import { RecoveryRing } from "./recovery-ring";
import { NutritionCard } from "./nutrition-card";
import { CardioCard } from "./cardio-card";
import type { CardioSummary } from "../cardio";
import { syncHealthKitData } from "@/lib/native/healthkit";
import { syncRecoveryWidgetSnapshot } from "@/lib/native/shared-data";
import { syncRecoveryToWatch } from "@/lib/native/watch-connectivity";
import dynamic from "next/dynamic";
import { saveHealthCache, loadHealthCache } from "@/lib/offline/screen-caches";

type HealthDashboardCached = {
  snapshots: HealthSnapshot[];
  recovery: RecoveryBreakdown | null;
  cardio: CardioSummary | null;
};

const HealthMetricChart = dynamic(
  () => import("./health-metric-chart").then((m) => m.HealthMetricChart),
  {
    ssr: false,
    loading: () => <div className="h-44 w-full animate-pulse rounded-xl bg-white/5" />,
  }
);

type TrendDays = 7 | 30;

// Name of the iOS Shortcut that posts Health data to /api/health-data.
// Must match exactly what the user named it in the Shortcuts app.
// (Native Apple-Shortcuts flow — see /health/shortcut for the setup guide.)
const SYNC_SHORTCUT_NAME = "FitTrack Sync";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function HealthDashboard({
  initialSnapshots,
  initialRecovery,
  initialCardio,
}: {
  /** Server-prefetched data — renders instantly without the client fetch waterfall. */
  initialSnapshots?: HealthSnapshot[];
  initialRecovery?: RecoveryBreakdown | null;
  initialCardio?: CardioSummary | null;
} = {}) {
  const { t } = useI18n();
  const hasInitialData = initialSnapshots != null;
  const [snapshots, setSnapshots] = useState<HealthSnapshot[]>(initialSnapshots ?? []);
  const [recovery, setRecovery] = useState<RecoveryBreakdown | null>(initialRecovery ?? null);
  const [cardio, setCardio] = useState<CardioSummary | null>(initialCardio ?? null);
  // Mirrors of the three states above, read inside `load` instead of the
  // state itself — keeps `load`'s identity stable across renders (it's a
  // dependency of the mount effect below; if it changed identity every time
  // a fetch completed, that effect would re-fire and loop forever).
  const snapshotsRef = useRef(snapshots);
  const recoveryRef = useRef(recovery);
  const cardioRef = useRef(cardio);
  snapshotsRef.current = snapshots;
  recoveryRef.current = recovery;
  cardioRef.current = cardio;
  const [loading, setLoading] = useState(!hasInitialData);
  const [refreshing, setRefreshing] = useState(false);
  const [waitingForShortcut, setWaitingForShortcut] = useState(false);
  const [trend, setTrend] = useState<TrendDays>(7);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Guards against out-of-order responses: if load() is called again before
  // an in-flight call finishes (e.g. refresh tapped twice, or the
  // visibilitychange handler firing while a manual refresh is still
  // running), a slower/older response must not overwrite fresher state.
  const requestIdRef = useRef(0);

  const load = useCallback(async (silent = false) => {
    const requestId = ++requestIdRef.current;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setFetchError(null);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const cached = await loadHealthCache<HealthDashboardCached>("dashboard");
      if (requestId === requestIdRef.current) {
        if (cached) {
          setSnapshots(cached.snapshots);
          setRecovery(cached.recovery);
          setCardio(cached.cardio);
        } else {
          setFetchError("Offline — keine zwischengespeicherten Daten vorhanden.");
        }
        setLoading(false);
        setRefreshing(false);
      }
      return;
    }

    try {
      const [snapsRes, recRes, cardioRes] = await Promise.all([
        fetch("/api/health-data?limit=30", { credentials: "include" }),
        fetch("/api/health/recovery", { credentials: "include" }),
        fetch("/api/health/cardio", { credentials: "include" }),
      ]);
      // A newer load() started after us — our results are stale, discard them.
      if (requestId !== requestIdRef.current) return;

      const errors: string[] = [];
      let nextSnapshots = snapshotsRef.current;
      let nextRecovery = recoveryRef.current;
      let nextCardio = cardioRef.current;
      if (snapsRes.ok) {
        const json = (await snapsRes.json()) as { data: HealthSnapshot[] };
        nextSnapshots = json.data;
        setSnapshots(nextSnapshots);
      } else {
        // Surface the real reason instead of silently rendering the empty state.
        // 500s here usually mean the DB schema is out of sync with Prisma.
        errors.push(`Gesundheitsdaten konnten nicht geladen werden (${snapsRes.status})`);
      }
      if (recRes.ok) {
        const json = (await recRes.json()) as { data: RecoveryBreakdown };
        nextRecovery = json.data;
        setRecovery(nextRecovery);
        if (json.data.level !== "none") {
          void syncRecoveryWidgetSnapshot(json.data.score, json.data.level);
          void syncRecoveryToWatch(json.data.score, json.data.level);
        }
      } else {
        errors.push(`Recovery-Daten konnten nicht geladen werden (${recRes.status})`);
      }
      if (cardioRes.ok) {
        const json = (await cardioRes.json()) as { data: CardioSummary };
        nextCardio = json.data;
        setCardio(nextCardio);
      } else {
        errors.push(`Cardio-Daten konnten nicht geladen werden (${cardioRes.status})`);
      }
      if (errors.length > 0) setFetchError(errors.join(" · "));
      void saveHealthCache<HealthDashboardCached>("dashboard", {
        snapshots: nextSnapshots,
        recovery: nextRecovery,
        cardio: nextCardio,
      });
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      const cached = await loadHealthCache<HealthDashboardCached>("dashboard");
      if (requestId !== requestIdRef.current) return;
      if (cached) {
        setSnapshots(cached.snapshots);
        setRecovery(cached.recovery);
        setCardio(cached.cardio);
      } else {
        setFetchError(`Verbindungsfehler: ${err instanceof Error ? err.message : "unbekannt"}`);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    // Server already provided fresh data — no mount fetch needed then.
    if (!hasInitialData) void load();
  }, [load, hasInitialData]);

  // When the user returns from the Shortcuts app via x-callback-url,
  // re-fetch the data so the freshly-uploaded snapshots show up.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible" && waitingForShortcut) {
        setWaitingForShortcut(false);
        // Small delay so HAE has time to finish the upload after returning
        const timer = setTimeout(() => { void load(true); }, 1200);
        return () => clearTimeout(timer);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [load, waitingForShortcut]);

  const handleRefresh = useCallback(() => {
    if (Capacitor.isNativePlatform()) {
      // Native iOS app: pull straight from HealthKit via the Capacitor
      // plugin — no Shortcuts app involved at all.
      setRefreshing(true);
      void (async () => {
        let syncError: string | null = null;
        try {
          await syncHealthKitData();
        } catch (err) {
          console.error("[healthkit] manual sync failed", err);
          syncError = `HealthKit-Sync fehlgeschlagen: ${err instanceof Error ? err.message : "unbekannt"}`;
        }
        await load(true);
        // Sync failing still lets load(true) re-fetch (now-stale) data
        // successfully, so only surface the sync error if load() didn't
        // already report a more specific one of its own.
        if (syncError) setFetchError((current) => current ?? syncError);
      })();
    } else if (isIOS()) {
      // Web/PWA on iOS (no native shell available): fall back to the
      // Health Auto Export Shortcut. Shortcuts runs the export and stops
      // there — the user manually returns to the browser; visibilitychange
      // detects that and refreshes the data.
      setWaitingForShortcut(true);
      setRefreshing(true);
      const name = encodeURIComponent(SYNC_SHORTCUT_NAME);
      window.location.href = `shortcuts://run-shortcut?name=${name}`;
    } else {
      void load(true);
    }
  }, [load]);

  const today = snapshots.at(-1) ?? null;

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-[18px] bg-white/5" />
        ))}
      </div>
    );
  }

  if (snapshots.length === 0) {
    if (fetchError) {
      return (
        <div
          className="flex flex-col items-center gap-4 rounded-[22px] p-8 text-center"
          style={{ background: "#121214", border: "1px solid rgba(255,69,58,0.3)" }}
        >
          <span className="text-4xl">⚠️</span>
          <div>
            <p className="text-[16px] font-semibold text-white">Fehler beim Laden</p>
            <p className="mt-1 text-[13px]" style={{ color: "#FF9F0A" }}>{fetchError}</p>
            <p className="mt-2 text-[12px]" style={{ color: "#9A9AA2" }}>
              Häufige Ursache: DB-Schema ist veraltet — der Admin muss <code className="text-white">npm run db:push</code> ausführen.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full px-4 py-1.5 text-[13px] font-semibold"
            style={{ background: "rgba(255,255,255,0.06)", color: "#fff" }}
          >
            Erneut versuchen
          </button>
        </div>
      );
    }

    return (
      <div
        className="flex flex-col items-center gap-4 rounded-[22px] p-8 text-center"
        style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <span className="text-4xl">🍎</span>
        <div>
          <p className="text-[16px] font-semibold text-white">{t("health.noData")}</p>
          <p className="mt-1 text-[13px]" style={{ color: "#9A9AA2" }}>{t("health.noDataHint")}</p>
        </div>
        <Link href={`${ROUTES.health}/shortcut`} className={buttonVariants({ size: "sm" }) + " mt-1"}>
          {t("health.setupShortcut")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">{t("health.title")}</h1>
          <p className="text-[13px]" style={{ color: "#9A9AA2" }}>{t("health.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex h-9 w-9 items-center justify-center rounded-full transition-colors"
          style={{ background: "rgba(255,255,255,0.06)" }}
          aria-label={
            Capacitor.isNativePlatform()
              ? "Gesundheitsdaten aus HealthKit synchronisieren"
              : "Sync via Health Auto Export Kurzbefehl auslösen"
          }
        >
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            style={{ color: "#9A9AA2" }}
          />
        </button>
      </div>

      {/* Recovery Ring */}
      {recovery && recovery.level !== "none" && (
        <RecoveryRing recovery={recovery} />
      )}

      {/* Nutrition card */}
      {today && <NutritionCard snapshot={today} />}

      {/* Cardio card */}
      {cardio && <CardioCard summary={cardio} />}

      {/* Today's Summary Grid */}
      {today && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#9A9AA2" }}>
            {t("health.todayTitle")}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <HealthStatPill
              href={`${ROUTES.health}/sleep`}
              icon={<Moon className="h-3.5 w-3.5" />}
              label={t("health.sleep")}
              value={today.sleepDuration != null ? formatSleepDuration(today.sleepDuration) : null}
              accent="#6E5BFF"
            />
            <HealthStatPill
              href={`${ROUTES.health}/resting-hr`}
              icon={<Heart className="h-3.5 w-3.5" />}
              label={t("health.restingHR")}
              value={today.restingHeartRate?.toString() ?? null}
              unit={today.restingHeartRate != null ? t("health.unit.bpm") : undefined}
              accent="#FF453A"
            />
            <HealthStatPill
              href={`${ROUTES.health}/steps`}
              icon={<Footprints className="h-3.5 w-3.5" />}
              label={t("health.steps")}
              value={today.steps != null ? today.steps.toLocaleString() : null}
              accent="#D4FF3A"
            />
            <HealthStatPill
              href={`${ROUTES.health}/active-calories`}
              icon={<Flame className="h-3.5 w-3.5" />}
              label={t("health.activeCalories")}
              value={today.activeCalories != null ? Math.round(today.activeCalories).toString() : null}
              unit={today.activeCalories != null ? t("health.unit.kcal") : undefined}
              accent="#FF9F0A"
            />
          </div>
        </div>
      )}

      {/* Extra stats */}
      {today && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <HealthStatPill
            href={`${ROUTES.health}/hrv`}
            icon={<Zap className="h-3.5 w-3.5" />}
            label={t("health.hrv")}
            value={today.hrv != null ? today.hrv.toFixed(0) : null}
            unit={today.hrv != null ? t("health.unit.ms") : undefined}
            accent="#30D158"
          />
          <HealthStatPill
            href={`${ROUTES.health}/exercise-minutes`}
            icon={<Timer className="h-3.5 w-3.5" />}
            label={t("health.exerciseMinutes")}
            value={today.exerciseMinutes?.toString() ?? null}
            unit={today.exerciseMinutes != null ? t("health.unit.minutes") : undefined}
            accent="#FFB340"
          />
          <HealthStatPill
            href={`${ROUTES.health}/vo2-max`}
            icon={<Wind className="h-3.5 w-3.5" />}
            label={t("health.vo2Max")}
            value={today.vo2Max != null ? today.vo2Max.toFixed(1) : null}
            unit={today.vo2Max != null ? t("health.unit.mlPerKgMin") : undefined}
            accent="#64D2FF"
          />
          <HealthStatPill
            href={`${ROUTES.health}/water`}
            icon={<Droplets className="h-3.5 w-3.5" />}
            label={t("health.water")}
            value={today.water != null ? (today.water / 1000).toFixed(1) : null}
            unit={today.water != null ? "L" : undefined}
            accent="#0A84FF"
          />
        </div>
      )}

      {/* Trend toggle */}
      <div className="flex gap-2">
        {([7, 30] as TrendDays[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setTrend(d)}
            className="rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors"
            style={
              trend === d
                ? { background: "#D4FF3A", color: "#0A1300" }
                : { background: "rgba(255,255,255,0.06)", color: "#9A9AA2" }
            }
          >
            {d === 7 ? t("health.trend7d") : t("health.trend30d")}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="space-y-3">
        <HealthMetricChart
          data={snapshots}
          metric="sleepDuration"
          label={t("health.sleep")}
          unit={t("health.unit.hours")}
          color="#6E5BFF"
          days={trend}
        />
        <HealthMetricChart
          data={snapshots}
          metric="restingHeartRate"
          label={t("health.restingHR")}
          unit={t("health.unit.bpm")}
          color="#FF453A"
          days={trend}
        />
        <HealthMetricChart
          data={snapshots}
          metric="hrv"
          label={t("health.hrv")}
          unit={t("health.unit.ms")}
          color="#30D158"
          days={trend}
        />
        <HealthMetricChart
          data={snapshots}
          metric="steps"
          label={t("health.steps")}
          color="#D4FF3A"
          days={trend}
        />
        <HealthMetricChart
          data={snapshots}
          metric="activeCalories"
          label={t("health.activeCalories")}
          unit={t("health.unit.kcal")}
          color="#FF9F0A"
          days={trend}
        />
        <HealthMetricChart
          data={snapshots}
          metric="vo2Max"
          label={t("health.vo2Max")}
          unit={t("health.unit.mlPerKgMin")}
          color="#64D2FF"
          days={trend}
        />
      </div>

      {/* Shortcut setup link */}
      <Link
        href={`${ROUTES.health}/shortcut`}
        className="flex items-center gap-3 rounded-[18px] p-4 transition-colors active:bg-white/5"
        style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          🍎
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-white">{t("health.shortcutGuide.title")}</p>
          <p className="text-[12px]" style={{ color: "#9A9AA2" }}>{t("health.shortcutGuide.subtitle")}</p>
        </div>
        <span style={{ color: "#5E5E66" }}>›</span>
      </Link>
    </div>
  );
}
