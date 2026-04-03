"use client";

import Link from "next/link";
import { Dumbbell, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { exercisePath } from "@/lib/constants";
import { useI18n } from "@/lib/i18n-provider";

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
    <Card className="transition-colors hover:bg-muted/50">
      <CardContent className="flex items-center gap-2 py-3 px-4">
        <Link
          href={exercisePath(exercise.id)}
          className="flex min-w-0 flex-1 items-center gap-4 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Dumbbell className="h-5 w-5 text-primary" />
          </div>

          <div className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-2">
              <p className="font-medium truncate">{exercise.name}</p>
            {exercise.isCustom && (
              <Badge variant="outline" className="text-xs shrink-0">
                {t("exercises.custom")}
              </Badge>
            )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatLabel(exercise.muscleGroup)}</span>
              <span>·</span>
              <span>{formatLabel(exercise.equipment)}</span>
            </div>
            {exercise.notes && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {exercise.notes}
              </p>
            )}
          </div>
        </Link>

        {exercise.isCustom && (
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit?.(exercise);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              className="text-destructive hover:text-destructive"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete?.(exercise);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
