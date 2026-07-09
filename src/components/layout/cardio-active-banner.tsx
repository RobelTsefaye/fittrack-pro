"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n-provider";
import { useCardioLive } from "@/features/cardio/cardio-live-context";
import { ROUTES } from "@/lib/constants";

/** Mirrors ActiveWorkoutBanner's look for the parallel cardio flow — cardio
 *  has no DB workout row to poll (see cardio-connectivity.ts), so this reads
 *  the live WatchConnectivity push instead of an API. */
export function CardioActiveBanner() {
  const { t } = useI18n();
  const pathname = usePathname();
  const live = useCardioLive();

  if (!live?.isRunning) return null;
  if (pathname === ROUTES.cardioWorkout) return null;

  return (
    <div className="shrink-0 border-b border-primary/15 bg-primary/8 dark:bg-primary/12 px-2 py-1.5">
      <Link
        href={ROUTES.cardioWorkout}
        className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t("cardio.activeSessionBannerAria")}
      >
        {/* Pulsing indicator */}
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
        </span>

        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Activity className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
            {t("cardio.activeSessionBanner")}
          </span>
        </span>

        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--sys-label3)]" aria-hidden />
      </Link>
    </div>
  );
}
