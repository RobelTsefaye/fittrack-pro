"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronRight, Dumbbell } from "lucide-react";
import { useI18n } from "@/lib/i18n-provider";

const CHANGED = "fittrack-active-workout-changed";

type ActiveItem = { id: string; name: string | null; startedAt: string };

export function ActiveWorkoutBanner() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { status } = useSession();
  const [active, setActive] = useState<ActiveItem | null>(null);
  const lastFetchedAt = useRef(0);

  const fetchActive = useCallback(async () => {
    if (status !== "authenticated") { setActive(null); return; }
    lastFetchedAt.current = Date.now();
    try {
      const res = await fetch("/api/workouts?status=active&limit=1", { credentials: "include" });
      if (!res.ok) { setActive(null); return; }
      const json = (await res.json()) as { data?: ActiveItem[] };
      const item = json.data?.[0] ?? null;
      setActive(item);

      // ── Pre-cache the active workout page so it works offline ──────────
      if (item && navigator.onLine && "serviceWorker" in navigator) {
        const workoutUrl = `/workouts/${item.id}`;
        // Store ID in localStorage so other warmers can pick it up
        try { localStorage.setItem("fittrack-active-workout-url", workoutUrl); } catch { /**/ }
        navigator.serviceWorker.ready
          .then((reg) => reg.active?.postMessage({ type: "WARM_CACHE", routes: [workoutUrl] }))
          .catch(() => { /**/ });
      } else if (!item) {
        try { localStorage.removeItem("fittrack-active-workout-url"); } catch { /**/ }
      }
    } catch {
      setActive(null);
    }
  }, [status]);

  // Route changes only refetch when the data is stale — without the guard
  // every tab switch fires an extra API call before the page can settle.
  useEffect(() => {
    if (Date.now() - lastFetchedAt.current < 10_000) return;
    void fetchActive();
  }, [fetchActive, pathname]);

  useEffect(() => {
    const onChanged = () => void fetchActive();
    window.addEventListener(CHANGED, onChanged);
    window.addEventListener("fittrack-offline-synced", onChanged);
    const iv = setInterval(() => void fetchActive(), 25000);
    const onVis = () => { if (document.visibilityState === "visible") void fetchActive(); };
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
    <div className="shrink-0 border-b border-primary/15 bg-primary/8 dark:bg-primary/12 px-2 py-1.5">
      <Link
        href={`/workouts/${active.id}`}
        className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t("workouts.activeSessionBannerAria", { name: title })}
      >
        {/* Pulsing indicator */}
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
        </span>

        {/* Icon + text */}
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Dumbbell className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 truncate text-sm">
            <span className="font-semibold text-foreground">{t("workouts.activeSessionBanner")}</span>
            <span className="mx-1.5 text-[var(--sys-label3)]">—</span>
            <span className="text-[var(--sys-label2)]">{title}</span>
          </span>
        </span>

        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--sys-label3)]" aria-hidden />
      </Link>
    </div>
  );
}

export function notifyActiveWorkoutChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGED));
  }
}
