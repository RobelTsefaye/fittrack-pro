"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { flushAllQueues } from "@/lib/offline/flush-all-queues";
import { toast } from "sonner";

async function warmCurrentRoute(pathname: string) {
  if (!("serviceWorker" in navigator) || !navigator.onLine) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) return;
    // Cache the current page and the workout page the user is on
    const routes = [pathname];
    reg.active.postMessage({ type: "WARM_CACHE", routes });
  } catch { /* non-fatal */ }
}

export function OfflineSyncProvider() {
  const pathname = usePathname();
  const router = useRouter();
  const busy = useRef(false);

  useEffect(() => {
    async function run() {
      if (typeof navigator === "undefined" || !navigator.onLine || busy.current) return;
      busy.current = true;
      try {
        const { workouts, bodyWeight } = await flushAllQueues();

        for (const { routeId, result } of workouts) {
          if (!result.ok && result.error && result.error !== "offline") {
            toast.error(`Sync failed: ${result.error}`);
          }
          if (result.ok && result.newServerWorkoutId) {
            const prefix = `/workouts/${routeId}`;
            if (
              pathname === prefix ||
              pathname.startsWith(`${prefix}/`) ||
              // Offline workouts render inline on /workouts/new
              pathname === "/workouts/new"
            ) {
              router.replace(`/workouts/${result.newServerWorkoutId}`);
            }
            toast.success("Offline workout saved to your account.");
          }
        }

        if (bodyWeight.flushed > 0 && bodyWeight.ok) {
          // Notify body weight tracker to reload from server
          window.dispatchEvent(new Event("fittrack-bw-synced"));
        }
        if (!bodyWeight.ok && bodyWeight.error && bodyWeight.error !== "offline") {
          toast.error(`Body weight sync failed: ${bodyWeight.error}`);
        }
      } finally {
        busy.current = false;
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("fittrack-offline-synced"));
      }
    }

    void run();

    // Cache the current page every time we come online
    if (navigator.onLine) warmCurrentRoute(pathname);
    window.addEventListener("online", () => {
      void run();
      void warmCurrentRoute(pathname);
    });
    return () => window.removeEventListener("online", run);
  }, [pathname, router]);

  return null;
}
