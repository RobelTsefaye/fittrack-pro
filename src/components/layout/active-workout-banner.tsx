"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/app-link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { ChevronRight, Dumbbell } from "lucide-react";
import { useI18n } from "@/lib/i18n-provider";
import { workoutHref } from "@/lib/workout-href";
import { getCachedToken } from "@/lib/native/auth-token-cache";

const CHANGED = "fittrack-active-workout-changed";

type ActiveItem = { id: string; name: string | null; startedAt: string };
export type ActiveWorkoutItem = ActiveItem;

export function ActiveWorkoutBanner({ initialActive = null }: { initialActive?: ActiveItem | null }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const { status } = useSession();
  // On native, `status` comes from a cookie-backed session that's only
  // best-effort synced (see project-docs/offline-first-roadmap.md Phase 2)
  // and can silently die while the actual Bearer-token login stays valid —
  // that would otherwise both stop this banner's fetch (line below) AND hide
  // it outright via the render guard further down, for a user who's fully
  // logged in and using the rest of the app normally. `null` = not checked
  // yet, `true`/`false` = a real Keychain-backed answer.
  const [nativeToken, setNativeToken] = useState<boolean | null>(
    Capacitor.isNativePlatform() ? null : true
  );
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void getCachedToken().then((token) => setNativeToken(token != null));
  }, []);
  const isNative = Capacitor.isNativePlatform();
  const [active, setActive] = useState<ActiveItem | null>(initialActive);
  // Server already gave us an accurate snapshot for the very first paint —
  // skip the redundant client refetch on mount so the banner can't pop
  // in/out mid-tap right after navigation (that shift used to make taps on
  // the list below register on the wrong row, e.g. on the "Mehr" page).
  // Seeded in the mount effect below rather than inline (`useRef(Date.now())`)
  // — calling Date.now() during render is impure and flagged by the React
  // Compiler; the effect runs before the stale-guard effect, so the initial
  // refetch is still skipped.
  const lastFetchedAt = useRef(0);
  useEffect(() => {
    lastFetchedAt.current = Date.now();
  }, []);

  const fetchActive = useCallback(async () => {
    // No synchronous setState here — this is invoked straight from effect
    // bodies, and a sync setActive would trip React 19's set-state-in-effect
    // rule. The signed-out case is handled by the render guard below instead.
    if (isNative ? nativeToken !== true : status !== "authenticated") return;
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
  }, [status, isNative, nativeToken]);

  // Route changes only refetch when the data is stale — without the guard
  // every tab switch fires an extra API call before the page can settle.
  // Deferred to a (cancellable) timeout so the fetch kicks off outside the
  // effect body itself — setState must only ever run from a callback here.
  useEffect(() => {
    if (Date.now() - lastFetchedAt.current < 10_000) return;
    const id = setTimeout(() => { void fetchActive(); }, 0);
    return () => clearTimeout(id);
  }, [fetchActive, pathname]);

  useEffect(() => {
    const onChanged = () => void fetchActive();
    window.addEventListener(CHANGED, onChanged);
    window.addEventListener("fittrack-offline-synced", onChanged);
    // 25s felt like the app was "constantly loading" in the background —
    // the event listeners above already cover the cases where accuracy
    // actually matters (workout start/stop, offline sync, tab refocus), so
    // this interval is just a slow safety-net poll, not the primary trigger.
    const iv = setInterval(() => void fetchActive(), 90000);
    const onVis = () => { if (document.visibilityState === "visible") void fetchActive(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener(CHANGED, onChanged);
      window.removeEventListener("fittrack-offline-synced", onChanged);
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchActive]);

  // Signed out (or session expired): hide the banner outright rather than
  // clearing `active` state from within fetchActive. Deliberately checks for
  // "unauthenticated" (not !== "authenticated") so the server-provided banner
  // stays visible during the brief client-side "loading" phase — hiding it
  // there would reintroduce the pop-in/layout-shift this component guards
  // against (see lastFetchedAt comment above).
  // On native, only hide for a *confirmed* logged-out state (nativeToken ===
  // false) — the old `status === "unauthenticated"` check would also hide it
  // for a live token whose cookie session simply never synced.
  const signedOut = isNative ? nativeToken === false : status === "unauthenticated";
  if (signedOut || !active) return null;
  // On native, the current workout's URL is /workouts/_?id=<id> (see
  // workout-href.ts); on web it's the plain /workouts/<id> path. Read the
  // query directly off window.location rather than useSearchParams() — that
  // hook needs a Suspense boundary, and this component sits at the app-shell
  // root where every page would have to be wrapped for it.
  const onActiveWorkoutPage =
    pathname === `/workouts/${active.id}` ||
    (pathname === "/workouts/_" &&
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("id") === active.id);
  if (onActiveWorkoutPage) return null;

  const title = active.name?.trim() || t("workouts.workoutFallback");

  return (
    <div className="shrink-0 border-b border-primary/15 bg-primary/8 dark:bg-primary/12 px-2 py-1.5">
      <Link
        href={workoutHref(active.id)}
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
