"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n-provider";
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
      router.push(`/workouts/${json.data.id}`);
    } catch {
      setLoading(false);
    }
  }

  return (
    <Card className="border-primary/30 bg-primary/5 dark:bg-primary/10">
      <CardHeader className="pb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {nextSession.planName}
        </p>
        <CardTitle className="text-base">{t("dashboard.nextWorkoutTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 mb-4">
          {nextSession.lastSessionName && (
            <>
              <span className="text-sm text-muted-foreground">{nextSession.lastSessionName}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </>
          )}
          <span className="text-sm font-semibold">{nextSession.sessionName}</span>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {t("dashboard.exerciseCount", { count: nextSession.exerciseCount })}
          </p>
          <Button onClick={handleStart} disabled={loading} size="sm">
            <Play className="mr-1.5 h-3.5 w-3.5" />
            {loading ? t("dashboard.nextWorkoutStarting") : t("dashboard.nextWorkoutStart")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
