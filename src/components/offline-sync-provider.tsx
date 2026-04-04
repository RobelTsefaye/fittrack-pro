"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { flushAllQueues } from "@/lib/offline/flush-all-queues";
import { toast } from "sonner";

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
            if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
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
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [pathname, router]);

  return null;
}
