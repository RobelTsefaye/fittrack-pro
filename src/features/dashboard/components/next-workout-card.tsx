"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { useI18n } from "@/lib/i18n-provider";
import { workoutHref } from "@/lib/workout-href";
import type { NextPlanSession } from "@/features/dashboard/queries";
import { notifyActiveWorkoutChanged } from "@/components/layout/active-workout-banner";

interface NextWorkoutCardProps {
  nextSession: NextPlanSession;
}

export function NextWorkoutCard({ nextSession }: NextWorkoutCardProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (!nextSession) return null;

  async function handleStart() {
    if (!nextSession) return;
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
