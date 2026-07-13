"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { useI18n } from "@/lib/i18n-provider";
import { workoutHref } from "@/lib/workout-href";
import { ROUTES } from "@/lib/constants";
import type { NextPlanSession } from "@/features/dashboard/queries";
import { notifyActiveWorkoutChanged } from "@/components/layout/active-workout-banner";
import { loadPlanDetailCache } from "@/lib/offline/screen-caches";
import { startPlanSessionOffline } from "@/lib/offline/plan-session-offline";

type CachedPlanDetail = {
  id: string;
  sessions: {
    id: string;
    name: string;
    exercises: {
      exerciseId: string;
      targetSets: number;
      exercise: { id: string; name: string; muscleGroup: string; equipment: string };
    }[];
  }[];
};

interface NextWorkoutCardProps {
  nextSession: NextPlanSession;
}

export function NextWorkoutCard({ nextSession }: NextWorkoutCardProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (!nextSession) return null;

  // This card only has the session's name/exercise count itself (see
  // NextPlanSession) — but it does have planId, and the plan detail page
  // caches the FULL plan (exercises + targetSets) under that id whenever it
  // loads online (see plan-detail-view.tsx). If the user's visited that
  // plan before, we can build the offline workout from that cached copy
  // instead of degrading to the manual-start fallback.
  async function tryStartOffline(): Promise<boolean> {
    if (!nextSession) return false;
    const cached = await loadPlanDetailCache<CachedPlanDetail>(nextSession.planId);
    const session = cached?.sessions.find((s) => s.id === nextSession.sessionId);
    if (!session) return false;
    await startPlanSessionOffline({
      id: session.id,
      name: session.name,
      exercises: session.exercises.map((pse) => ({
        exerciseId: pse.exerciseId,
        targetSets: pse.targetSets,
        exercise: pse.exercise,
      })),
    });
    notifyActiveWorkoutChanged();
    router.push(ROUTES.newWorkout);
    return true;
  }

  async function handleStart() {
    if (!nextSession) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (await tryStartOffline()) return;
      // No cached copy of this plan to build from — fall back to manual
      // start instead of silently failing.
      toast.info(t("dashboard.nextWorkoutOfflineFallback"));
      router.push(ROUTES.newWorkout);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/plan-sessions/${nextSession.sessionId}/start`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.data?.id) throw new Error();
      notifyActiveWorkoutChanged();
      router.push(workoutHref(json.data.id));
    } catch {
      setLoading(false);
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (await tryStartOffline()) return;
        toast.info(t("dashboard.nextWorkoutOfflineFallback"));
        router.push(ROUTES.newWorkout);
      }
    }
  }

  return (
    <div
      className="relative overflow-hidden rounded-[22px] p-[18px]"
      style={{
        background: "linear-gradient(140deg, #1B2207 0%, #121214 70%)",
        border: "1px solid rgba(255,255,255,0.14)",
      }}
    >
      {/* Glow orb */}
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-[220px] w-[220px] rounded-full"
        style={{ background: "rgba(212,255,58,0.12)", filter: "blur(50px)" }}
      />

      <div className="relative">
        {/* Volt tag */}
        <span
          className="inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-[11px] font-semibold uppercase tracking-[0.04em]"
          style={{ background: "rgba(212,255,58,0.14)", color: "#D4FF3A" }}
        >
          {t("dashboard.nextWorkoutTitle")} · Today
        </span>

        {/* Plan name */}
        <p className="mt-1.5 text-[13px]" style={{ color: "#9A9AA2" }}>
          {nextSession.planName}
        </p>

        {/* Session name */}
        <h2 className="mt-0.5 text-[22px] font-bold tracking-tight leading-tight text-white">
          {nextSession.sessionName}
        </h2>

        {/* Meta */}
        <p className="mt-1 text-[13px]" style={{ color: "#9A9AA2" }}>
          {t("dashboard.exerciseCount", { count: nextSession.exerciseCount })}
        </p>

        {/* CTA */}
        <div className="mt-4">
          <button
            onClick={handleStart}
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] font-bold text-[15px] transition-opacity active:opacity-80 disabled:opacity-60"
            style={{ background: "#D4FF3A", color: "#0A1300" }}
          >
            <Play className="h-[1.125rem] w-[1.125rem] fill-current" />
            {loading ? t("dashboard.nextWorkoutStarting") : t("dashboard.nextWorkoutStart")}
          </button>
        </div>
      </div>
    </div>
  );
}
