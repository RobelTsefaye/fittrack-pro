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
  CardioNotNativeError,
  type CardioActivityType,
} from "@/lib/native/cardio-connectivity";
import { useCardioLive } from "@/features/cardio/cardio-live-context";
import {
  HEART_RATE_ZONE_BANDS,
  heartRateZoneLabel,
  heartRateZoneBpmRange,
  type HeartRateZone,
} from "@/lib/heart-rate-zones";

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
  const live = useCardioLive();
  /** Set once this page's own picker starts a session — but the live view
   *  below shows for *either* this being true or `live` already being
   *  active on mount, e.g. the user tapped CardioActiveBanner for a session
   *  started directly on the Watch, which this page never called
   *  startCardioSessionOnWatch for. */
  const [activityType, setActivityType] = useState<CardioActivityType | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const isLive = !!live?.isRunning || activityType != null;
  /** Guards against double-navigating: both the "ended on the Watch"
   *  live-update path and this page's own finish/cancel buttons lead to the
   *  same router.push, and could otherwise race if a live update lands
   *  right as the user taps a button. */
  const endedRef = useRef(false);
  /** Distinguishes "no live update has arrived yet" (right after this page's
   *  own start, briefly) from "one arrived, then the session actually
   *  ended" (`live` goes back to null either way) — without this, the
   *  auto-navigate-away effect below would fire immediately on every
   *  phone-initiated start, before the first push had a chance to land. */
  const receivedLiveRef = useRef(false);

  useEffect(() => {
    if (live) receivedLiveRef.current = true;
  }, [live]);

  useEffect(() => {
    if (!isLive || live != null || !receivedLiveRef.current || endedRef.current) return;
    // The session ended — on the Watch itself (its own "Beenden"/
    // "Abbrechen" button, or the 2s wedged-session watchdog), or via this
    // page's own handleEnd, which already set endedRef and doesn't need
    // this to fire again — leave automatically instead of showing a frozen,
    // now-stale live view with nothing left to interact with.
    endedRef.current = true;
    router.push(ROUTES.workouts);
  }, [isLive, live, router]);

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
  if (!isLive) {
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
  /** Where exactly within the current zone's bpm range the live heart rate
   *  sits (0 = just entered the zone, 1 = about to cross into the next
   *  one) — drives the pointer on the zone band below. */
  const zonePointerFraction =
    zone && live
      ? (() => {
          const { min, max } = heartRateZoneBpmRange(zone);
          return Math.min(1, Math.max(0, (live.heartRate - min) / (max - min)));
        })()
      : null;

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

                <div className="mt-3 flex w-full gap-1">
                  {HEART_RATE_ZONE_BANDS.map((band) => {
                    const isActive = band.zone === zone;
                    return (
                      <div
                        key={band.zone}
                        className="relative h-2 flex-1 rounded-full transition-opacity"
                        style={{
                          background: ZONE_COLORS[band.zone],
                          opacity: isActive ? 1 : 0.25,
                        }}
                      >
                        {isActive && zonePointerFraction != null ? (
                          <div
                            className="absolute -top-1.5 h-5 w-[3px] -translate-x-1/2 rounded-full bg-white transition-[left] duration-700 ease-out"
                            style={{
                              left: `${zonePointerFraction * 100}%`,
                              boxShadow: "0 0 4px rgba(0,0,0,0.6)",
                            }}
                          />
                        ) : null}
                      </div>
                    );
                  })}
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
