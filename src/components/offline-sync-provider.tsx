"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { flushAllWorkoutQueues } from "@/lib/offline/flush-all-queues";
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
        const results = await flushAllWorkoutQueues();
        for (const { routeId, result } of results) {
          if (!result.ok && result.error && result.error !== "offline") {
            toast.error(`Sync: ${result.error}`);
          }
          if (result.ok && result.newServerWorkoutId) {
            const prefix = `/workouts/${routeId}`;
            if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
              router.replace(`/workouts/${result.newServerWorkoutId}`);
            }
            toast.success("Offline workout saved to your account.");
          }
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
