"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Bike, Footprints, Watch } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n-provider";
import { cn } from "@/lib/utils";
import type { CardioActivityType } from "@/lib/native/cardio-connectivity";

/** The three gym options after a strength day — all indoor, like the Watch's own offer. */
const OPTIONS: Array<{ type: CardioActivityType; Icon: typeof Footprints; labelKey: string }> = [
  { type: "running", Icon: Footprints, labelKey: "cardio.after.running" },
  { type: "cycling", Icon: Bike, labelKey: "cardio.after.cycling" },
  { type: "elliptical", Icon: Activity, labelKey: "cardio.crosstrainer" },
];

const DURATIONS: Array<number | null> = [null, 20, 30, 45];

/** Cardio page URL that starts the session on the Watch right away (see workouts/cardio/page.tsx). */
export function cardioStartHref(type: CardioActivityType, minutes: number | null): string {
  const params = new URLSearchParams({ start: type, indoor: "1" });
  if (minutes) params.set("minutes", String(minutes));
  return `${ROUTES.cardioWorkout}?${params.toString()}`;
}

/**
 * "Cardio dranhängen?" — shown after finishing a plan day flagged
 * `cardioAfter` (the finish summary and the finished workout page). One tap
 * opens the cardio page, which starts the session in the FitTrack Watch app
 * and shows heart rate, zone and calories live.
 *
 * `beforeStart` runs first (e.g. saving the summary note); returning `false`
 * keeps the user here.
 */
export function CardioAfterPicker({
  beforeStart,
  className,
}: {
  beforeStart?: () => Promise<boolean | void> | boolean | void;
  className?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [minutes, setMinutes] = useState<number | null>(null);
  const [busy, setBusy] = useState<CardioActivityType | null>(null);

  async function pick(type: CardioActivityType) {
    if (busy) return;
    setBusy(type);
    try {
      if ((await beforeStart?.()) === false) {
        setBusy(null);
        return;
      }
    } catch {
      setBusy(null);
      return;
    }
    router.push(cardioStartHref(type, minutes));
  }

  return (
    <section className={cn("space-y-3 rounded-2xl bg-primary/[0.07] p-3.5 ring-1 ring-primary/25", className)}>
      <div className="flex items-start gap-2.5">
        <Watch className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("cardio.after.title")}</p>
          <p className="text-xs text-muted-foreground">{t("cardio.after.subtitle")}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(({ type, Icon, labelKey }) => (
          <button
            key={type}
            type="button"
            disabled={busy != null}
            onClick={() => void pick(type)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl bg-background/60 px-2 py-3 text-center text-xs font-semibold ring-1 ring-white/10 transition active:scale-95 disabled:opacity-60",
              busy === type && "bg-primary text-primary-foreground ring-primary"
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="leading-tight">{t(labelKey)}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5" role="group" aria-label={t("cardio.durationLabel")}>
        <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("cardio.durationLabel")}
        </span>
        {DURATIONS.map((m) => (
          <button
            key={m ?? "free"}
            type="button"
            aria-pressed={minutes === m}
            onClick={() => setMinutes(m)}
            className={cn(
              "h-8 flex-1 rounded-lg text-xs font-semibold tabular-nums transition-colors",
              minutes === m ? "bg-primary text-primary-foreground" : "bg-white/[0.06] text-muted-foreground"
            )}
          >
            {m == null ? t("cardio.durationFree") : t("cardio.durationMinutes", { minutes: m })}
          </button>
        ))}
      </div>
    </section>
  );
}
