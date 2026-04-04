"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronRight, Dumbbell } from "lucide-react";
import { useI18n } from "@/lib/i18n-provider";
import { cn } from "@/lib/utils";

const CHANGED = "fittrack-active-workout-changed";

type ActiveItem = { id: string; name: string | null; startedAt: string };

export function ActiveWorkoutBanner() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { status } = useSession();
  const [active, setActive] = useState<ActiveItem | null>(null);

  const fetchActive = useCallback(async () => {
    if (status !== "authenticated") {
      setActive(null);
      return;
    }
    try {
      const res = await fetch("/api/workouts?status=active&limit=1", {
        credentials: "include",
      });
      if (!res.ok) {
        setActive(null);
        return;
      }
      const json = (await res.json()) as { data?: ActiveItem[] };
      setActive(json.data?.[0] ?? null);
    } catch {
      setActive(null);
    }
  }, [status]);

  useEffect(() => {
    void fetchActive();
  }, [fetchActive, pathname]);

  useEffect(() => {
    const onChanged = () => void fetchActive();
    window.addEventListener(CHANGED, onChanged);
    window.addEventListener("fittrack-offline-synced", onChanged);
    const iv = setInterval(() => void fetchActive(), 25000);
    const onVis = () => {
      if (document.visibilityState === "visible") void fetchActive();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener(CHANGED, onChanged);
      window.removeEventListener("fittrack-offline-synced", onChanged);
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchActive]);

  if (!active) return null;
  if (pathname === `/workouts/${active.id}`) return null;

  const title = active.name?.trim() || t("workouts.workoutFallback");

  return (
    <div className="shrink-0 border-b border-primary/20 bg-primary/10 px-3 py-2 sm:px-4">
      <Link
        href={`/workouts/${active.id}`}
        className={cn(
          "flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
          "hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
        aria-label={t("workouts.activeSessionBannerAria", { name: title })}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Dumbbell className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 truncate">
            <span className="font-medium text-foreground">{t("workouts.activeSessionBanner")}</span>
            <span className="text-muted-foreground"> — {title}</span>
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </div>
  );
}

export function notifyActiveWorkoutChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGED));
  }
}
