"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { useRouter } from "next/navigation";

export function NativeWorkoutDeepLink() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listenerPromise = CapacitorApp.addListener("appUrlOpen", async (data) => {
      const url = new URL(data.url);
      if (url.protocol !== "fittrackpro:" || url.hostname !== "start-workout") return;
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) return;

      const res = await fetch(`/api/plan-sessions/${sessionId}/start`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return;
      const json = (await res.json()) as { data: { id: string } };
      router.push(`/workouts/${json.data.id}`);
    });

    return () => {
      void listenerPromise.then((handle) => handle.remove());
    };
  }, [router]);

  return null;
}
