"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "@/components/app-link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/lib/constants";
import { workoutHref } from "@/lib/workout-href";
import { useI18n } from "@/lib/i18n-provider";
import type { WorkoutData } from "@/features/workouts/workout-types";
import {
  distinctQueuedWorkoutIds,
  enqueueWorkoutOp,
  loadWorkoutSnapshot,
  saveWorkoutSnapshot,
} from "@/lib/offline/workout-offline-store";
import { notifyActiveWorkoutChanged } from "@/components/layout/active-workout-banner";
import { WorkoutDetail } from "@/features/workouts/components/workout-detail";

// ── Cached user settings (offline-safe) ─────────────────────────────────────
const SETTINGS_KEY = "fittrack-cached-settings";
type CachedSettings = { weightUnit: "KG" | "LB"; restTimerDefault: number };

function readCachedSettings(): CachedSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw) as CachedSettings;
  } catch {
    /* ignore */
  }
  return { weightUnit: "KG", restTimerDefault: 90 };
}

export default function NewWorkoutPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When set, render WorkoutDetail inline instead of the form
  const [offlineWorkoutId, setOfflineWorkoutId] = useState<string | null>(null);
  // Lazy initializer reads the cached settings during the first render
  // (client-side only — `readCachedSettings` swallows the SSR "localStorage is
  // undefined" and returns the default). Doing it here rather than via a
  // synchronous setState in the mount effect avoids the cascading re-render
  // React 19 flags, and `settings` doesn't affect the initial rendered form so
  // there's no hydration mismatch.
  const [settings, setSettings] = useState<CachedSettings>(readCachedSettings);

  // ── On mount: resume active offline workout + cache settings ────────────
  useEffect(() => {
    // Fetch + cache settings if online
    if (typeof navigator !== "undefined" && navigator.onLine) {
      fetch("/api/settings", { credentials: "include" })
        .then((r) => r.json())
        .then((json: { data?: { weightUnit?: string; restTimerDefault?: number } }) => {
          if (json.data) {
            const s: CachedSettings = {
              weightUnit: (json.data.weightUnit as "KG" | "LB") ?? "KG",
              restTimerDefault: json.data.restTimerDefault ?? 90,
            };
            setSettings(s);
            try {
              localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
            } catch {
              /* ignore */
            }
          }
        })
        .catch(() => {});
    }

    // Check for existing active offline workout → resume it
    void (async () => {
      try {
        const ids = await distinctQueuedWorkoutIds();
        for (const id of ids) {
          const snap = await loadWorkoutSnapshot(id);
          if (snap && !snap.data.completedAt) {
            setOfflineWorkoutId(id);
            return;
          }
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // ── Start offline: save to IndexedDB, show inline ──────────────────────
  const startOffline = useCallback(async () => {
    const trimmed = name.trim();
    const id = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const data: WorkoutData = {
      id,
      name: trimmed.length ? trimmed : null,
      notes: null,
      startedAt,
      completedAt: null,
      durationSeconds: null,
      planSessionId: null,
      workoutExercises: [],
    };
    await saveWorkoutSnapshot(id, data, true);
    await enqueueWorkoutOp(id, { t: "post_workout", name: data.name });
    notifyActiveWorkoutChanged();
    // Render WorkoutDetail inline — stay on /workouts/new (cached by SW)
    setOfflineWorkoutId(id);
  }, [name]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const body: { name?: string } = {};
    const trimmed = name.trim();
    if (trimmed) body.name = trimmed;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      try {
        await startOffline();
      } catch {
        setError(t("workouts.couldNotStart"));
        setSubmitting(false);
      }
      return;
    }

    try {
      const res = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          typeof json.error === "string" ? json.error : t("workouts.couldNotStart")
        );
        setSubmitting(false);
        return;
      }

      const id = json.data?.id as string | undefined;
      if (id) {
        notifyActiveWorkoutChanged();
        router.push(workoutHref(id));
      } else {
        setError(t("workouts.invalidResponse"));
        setSubmitting(false);
      }
    } catch {
      try {
        await startOffline();
      } catch {
        setError(t("workouts.couldNotStart"));
        setSubmitting(false);
      }
    }
  }

  async function handleStartOfflineClick() {
    setError(null);
    setSubmitting(true);
    try {
      await startOffline();
    } catch {
      setError(t("workouts.couldNotStart"));
      setSubmitting(false);
    }
  }

  // ── Inline offline workout view ────────────────────────────────────────
  if (offlineWorkoutId) {
    return (
      <WorkoutDetail
        workoutId={offlineWorkoutId}
        defaultRestSeconds={settings.restTimerDefault}
        weightUnit={settings.weightUnit}
      />
    );
  }

  // ── New workout form ───────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-md space-y-6">
      <Link
        href={ROUTES.workouts}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "inline-flex gap-1 -ml-2 px-2"
        )}
      >
        <ArrowLeft className="h-4 w-4" />
        {t("workouts.backToWorkouts")}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>{t("workouts.newTitle")}</CardTitle>
          <CardDescription>{t("workouts.newSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleStart} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workout-name">{t("workouts.name")}</Label>
              <Input
                id="workout-name"
                placeholder={t("workouts.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                disabled={submitting}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? t("workouts.starting") : t("workouts.begin")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={submitting}
              onClick={handleStartOfflineClick}
            >
              {t("workouts.startOffline")}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {t("workouts.startOfflineHint")}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
