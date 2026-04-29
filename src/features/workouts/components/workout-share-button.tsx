"use client";

import { useState } from "react";
import { Share2, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n-provider";
import type { WorkoutData } from "@/features/workouts/workout-types";

interface WorkoutShareButtonProps {
  workout: WorkoutData;
  weightUnit?: string;
  className?: string;
}

function buildShareText(workout: WorkoutData, unit: string): string {
  const name = workout.name?.trim() || "Workout";

  let totalSets  = 0;
  let totalVolume = 0;
  const exerciseLines: string[] = [];

  for (const ex of workout.workoutExercises ?? []) {
    const completedSets = ex.sets.filter((s) => s.isCompleted);
    if (completedSets.length === 0) continue;
    totalSets += completedSets.length;
    const vol = completedSets.reduce(
      (sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0),
      0
    );
    totalVolume += vol;
    const maxWeight = Math.max(...completedSets.map((s) => s.weight ?? 0));
    exerciseLines.push(
      `• ${ex.exercise?.name ?? "Exercise"}: ${completedSets.length} sets${maxWeight > 0 ? `, up to ${maxWeight}${unit}` : ""}`
    );
  }

  const volStr = totalVolume > 0
    ? `${Math.round(totalVolume).toLocaleString()}${unit}`
    : "bodyweight";

  return [
    `💪 Completed "${name}"`,
    `📊 ${totalSets} sets · ${volStr} total volume`,
    "",
    ...exerciseLines.slice(0, 6),
    exerciseLines.length > 6 ? `… and ${exerciseLines.length - 6} more` : "",
    "",
    "Tracked with FitTrack Pro",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export function WorkoutShareButton({
  workout,
  weightUnit = "kg",
  className,
}: WorkoutShareButtonProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const text = buildShareText(workout, weightUnit);

    // Try native Web Share API first (iOS Safari, Android Chrome)
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: workout.name?.trim() || "My Workout",
          text,
        });
        return;
      } catch {
        // User cancelled or not supported — fall through to clipboard
        if ((await navigator.permissions.query({ name: "clipboard-write" as PermissionName })).state === "denied") {
          toast.error(t("share.copyFailed"));
          return;
        }
      }
    }

    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(t("share.copied"));
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error(t("share.copyFailed"));
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleShare()}
      className={cn(
        "flex items-center gap-1.5 rounded-xl bg-[var(--sys-fill2)] px-3 py-2 text-sm font-semibold text-[var(--sys-label)] transition-all active:scale-95 hover:bg-[var(--sys-fill)]",
        className
      )}
      aria-label={t("share.shareWorkout")}
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Share2 className="h-4 w-4" />
      )}
      {t("share.shareWorkout")}
    </button>
  );
}
