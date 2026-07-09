"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bike, CheckCircle2, Flame, Footprints, HeartPulse, Timer as TimerIcon, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n-provider";
import {
  startCardioSessionOnWatch,
  stopCardioSessionOnWatch,
  onCardioLiveUpdate,
  CardioNotNativeError,
  type CardioActivityType,
  type CardioLiveUpdate,
} from "@/lib/native/cardio-connectivity";
import { HEART_RATE_ZONE_BANDS, heartRateZoneLabel, type HeartRateZone } from "@/lib/heart-rate-zones";

/** Matches HeartRateZones.color(for:) on the Watch and ZoneIndicatorView
 *  exactly — same reasoning as the shared bpm-band constants: one visual
 *  language for "which zone" across both devices, cool-to-warm like
 *  Apple's own Watch Heart Rate Zones feature. */
const ZONE_COLORS: Record<HeartRateZone, string> = {
  1: "#4A9EFF",
  2: "#2DD4C4",
  3: "#34D058",
  4: "#FF9F40",
  5: "#FF5A5A",
};

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function CardioWorkoutPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [activityType, setActivityType] = useState<CardioActivityType | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<CardioLiveUpdate | null>(null);
  const [ending, setEnding] = useState(false);
  /** Guards against double-navigating: both the "ended on the Watch"
   *  live-update path and this page's own finish/cancel buttons lead to the
   *  same router.push, and could otherwise race if a live update lands
   *  right as the user taps a button. */
  const endedRef = useRef(false);

  useEffect(() => {
    if (!activityType) return;
    return onCardioLiveUpdate((update) => {
      setLive(update);
      if (!update.isRunning && !endedRef.current) {
        // The session ended on the Watch itself (its own "Beenden"/
        // "Abbrechen" button, or the 2s wedged-session watchdog) rather than
        // through this page — leave automatically instead of showing a
        // frozen, now-stale live view with nothing left to interact with.
        endedRef.current = true;
        router.push(ROUTES.workouts);
      }
    });
  }, [activityType, router]);

  async function handleStart(type: CardioActivityType) {
    setError(null);
    setStarting(true);
    try {
      await startCardioSessionOnWatch(type);
      setActivityType(type);
    } catch (err) {
      if (err instanceof CardioNotNativeError) {
        setError(t("cardio.needsNativeApp"));
      } else {
        // Native-side errors (Swift) are German-only across this whole app
        // (Watch/WatchConnectivity messages are never localized) — shown
        // as-is here, same as every other Watch-request error surfaced
        // elsewhere in the app.
        setError(err instanceof Error ? err.message : t("cardio.startFailed"));
      }
    } finally {
      setStarting(false);
    }
  }

  async function handleEnd(discard: boolean) {
    if (!confirm(discard ? t("cardio.cancelConfirm") : t("cardio.finishConfirm"))) return;
    endedRef.current = true;
    setEnding(true);
    try {
      await stopCardioSessionOnWatch(discard);
    } catch {
      // Best-effort — the Watch's own Beenden/Abbrechen controls are the
      // fallback if this round-trip fails; nothing on the phone needs to
      // stay in sync since it holds no data of its own for this session.
    }
    router.push(ROUTES.workouts);
  }

  // ── Activity picker ─────────────────────────────────────────────────
  if (!activityType) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <Link
          href={ROUTES.workouts}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex gap-1 -ml-2 px-2")}
        >
          <ArrowLeft className="h-4 w-4" />
          {t("cardio.backToWorkouts")}
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>{t("cardio.pickTitle")}</CardTitle>
            <CardDescription>{t("cardio.pickSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full justify-start gap-3"
              size="lg"
              variant="outline"
              disabled={starting}
              onClick={() => void handleStart("running")}
            >
              <Footprints className="h-5 w-5" />
              {t("cardio.running")}
            </Button>
            <Button
              className="w-full justify-start gap-3"
              size="lg"
              variant="outline"
              disabled={starting}
              onClick={() => void handleStart("cycling")}
            >
              <Bike className="h-5 w-5" />
              {t("cardio.cycling")}
            </Button>
            {starting ? (
              <p className="text-center text-sm text-muted-foreground">{t("cardio.starting")}</p>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Live view ────────────────────────────────────────────────────────
  const zone = live?.zone as HeartRateZone | undefined;
  const zoneColor = zone ? ZONE_COLORS[zone] : "var(--muted-foreground)";

  return (
    <div className="mx-auto max-w-md space-y-6">
      <Card className="overflow-hidden">
        <CardContent className="space-y-6 pt-6">
          {!live ? (
            <p className="text-center text-sm text-muted-foreground">{t("cardio.waitingForData")}</p>
          ) : (
            <>
              {/* Zone — dominant, matches the Watch's own ZoneIndicatorView */}
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className="font-display text-6xl font-bold leading-none tabular-nums"
                  style={{ color: zoneColor }}
                >
                  {zone ?? "–"}
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {zone ? t("cardio.zoneLabel", { zone }) : t("cardio.noZone")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {zone ? heartRateZoneLabel(zone) : t("cardio.noZoneHint")}
                </span>

                <div className="mt-2 flex w-full gap-1">
                  {HEART_RATE_ZONE_BANDS.map((band) => (
                    <div
                      key={band.zone}
                      className="h-2 flex-1 rounded-full transition-opacity"
                      style={{
                        background: ZONE_COLORS[band.zone],
                        opacity: band.zone === zone ? 1 : 0.25,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Secondary stats */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <TimerIcon className="mx-auto h-4 w-4 text-muted-foreground" />
                  <p className="font-display mt-1 text-xl font-bold tabular-nums">
                    {formatElapsed(live.elapsedSeconds)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{t("cardio.elapsedLabel")}</p>
                </div>
                <div>
                  <HeartPulse className="mx-auto h-4 w-4 text-red-500" />
                  <p className="font-display mt-1 text-xl font-bold tabular-nums">
                    {Math.round(live.heartRate)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{t("cardio.heartRateLabel")}</p>
                </div>
                <div>
                  <Flame className="mx-auto h-4 w-4 text-orange-500" />
                  <p className="font-display mt-1 text-xl font-bold tabular-nums">
                    {Math.round(live.activeCalories)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{t("cardio.caloriesLabel")}</p>
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2">
            <Button className="flex-1" size="lg" disabled={ending} onClick={() => void handleEnd(false)}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {t("cardio.finish")}
            </Button>
            <Button
              className="flex-1"
              size="lg"
              variant="outline"
              disabled={ending}
              onClick={() => void handleEnd(true)}
            >
              <X className="mr-2 h-4 w-4" />
              {t("cardio.cancel")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
