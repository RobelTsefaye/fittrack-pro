"use client";

import { useEffect, useState } from "react";
import Link from "@/components/app-link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n-provider";
import {
  ExerciseDetailAnalytics,
  type AnalyticsBestPr,
  type AnalyticsHistoryRow,
} from "./exercise-detail-analytics";
import type { ProgressPoint, VolumePoint } from "@/features/exercises/progress-types";

function formatLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ExerciseDetailViewProps {
  exerciseId: string;
  weightUnit: "KG" | "LB";
}

export function ExerciseDetailView({ exerciseId, weightUnit }: ExerciseDetailViewProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [equipment, setEquipment] = useState("");
  const [history, setHistory] = useState<AnalyticsHistoryRow[]>([]);
  const [progressBySession, setProgressBySession] = useState<ProgressPoint[]>([]);
  const [volumeBySession, setVolumeBySession] = useState<VolumePoint[]>([]);
  const [bestPr, setBestPr] = useState<AnalyticsBestPr | null>(null);

  // Fetch history for the exercise. Inlined in the effect (rather than a
  // useCallback called synchronously from it) so every state update happens
  // after an await — `loading` already starts `true`, satisfying React 19's
  // set-state-in-effect rule. Re-runs when the exercise or locale changes; a
  // cancel flag drops results from a superseded fetch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/exercises/${exerciseId}/history`);
        if (cancelled) return;
        if (res.status === 404) {
          setError(t("exercises.notFound"));
          return;
        }
        if (!res.ok) {
          setError(t("exercises.loadFailed"));
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        const d = json.data;
        setError(null);
        setName(d.exercise.name);
        setMuscleGroup(d.exercise.muscleGroup);
        setEquipment(d.exercise.equipment);
        setHistory(d.history ?? []);
        setProgressBySession(d.progressBySession ?? []);
        setVolumeBySession(d.volumeBySession ?? []);
        setBestPr(d.bestPersonalRecord ?? null);
      } catch {
        if (!cancelled) setError(t("exercises.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [exerciseId, t]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-xl bg-muted/80" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          href={ROUTES.exercises}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex gap-1")}
        >
          <ArrowLeft className="h-4 w-4" />
          {t("exercises.detailBack")}
        </Link>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{error}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={ROUTES.exercises}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex gap-1 -ml-2")}
      >
        <ArrowLeft className="h-4 w-4" />
        {t("exercises.detailBack")}
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
        <div className="mt-1 flex flex-wrap gap-2">
          <Badge variant="secondary">{formatLabel(muscleGroup)}</Badge>
          <Badge variant="outline">{formatLabel(equipment)}</Badge>
        </div>
      </div>

      <ExerciseDetailAnalytics
        weightUnit={weightUnit}
        bestPr={bestPr}
        progressBySession={progressBySession}
        volumeBySession={volumeBySession}
        history={history}
      />
    </div>
  );
}
