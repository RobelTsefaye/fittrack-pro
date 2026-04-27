"use client";

import Link from "next/link";
import { ChevronRight, Dumbbell, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { exercisePath } from "@/lib/constants";
import { useI18n } from "@/lib/i18n-provider";
import { cn } from "@/lib/utils";

export interface ExerciseData {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  notes: string | null;
  isCustom: boolean;
}

function formatLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ExerciseCardProps {
  exercise: ExerciseData;
  onEdit?: (exercise: ExerciseData) => void;
  onDelete?: (exercise: ExerciseData) => void;
}

export function ExerciseCard({ exercise, onEdit, onDelete }: ExerciseCardProps) {
  const { t } = useI18n();

  return (
    <div className="ios-row group w-full gap-3 hover:bg-[var(--nav-hover-bg)] transition-colors">
      {/* Icon */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <Dumbbell className="h-4.5 w-4.5 text-primary h-[1.125rem] w-[1.125rem]" />
      </div>

      {/* Content — fills remaining space, navigates on click */}
      <Link
        href={exercisePath(exercise.id)}
        className="min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        <div className="flex items-center gap-2">
          <span className="truncate text-[0.9375rem] font-medium">{exercise.name}</span>
          {exercise.isCustom && (
            <Badge variant="outline" className="shrink-0 text-[0.6875rem]">
              {t("exercises.custom")}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-[var(--sys-label2)]">
          {formatLabel(exercise.muscleGroup)}
          <span className="mx-1 opacity-40">·</span>
          {formatLabel(exercise.equipment)}
        </p>
        {exercise.notes && (
          <p className="mt-0.5 truncate text-xs text-[var(--sys-label3)]">{exercise.notes}</p>
        )}
      </Link>

      {/* Actions (custom exercises only) */}
      {exercise.isCustom && (
        <div className={cn(
          "flex shrink-0 items-center gap-0.5",
          "opacity-0 group-hover:opacity-100 transition-opacity"
        )}>
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit?.(exercise);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            className="text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete?.(exercise);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Disclosure chevron */}
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--sys-label3)]" />
    </div>
  );
}
