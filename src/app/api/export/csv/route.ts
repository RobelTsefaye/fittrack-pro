import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

function csvCell(v: string | number | boolean | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workouts = await prisma.workout.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    include: {
      workoutExercises: {
        orderBy: { order: "asc" },
        include: {
          exercise: { select: { name: true } },
          sets: { orderBy: { setNumber: "asc" } },
        },
      },
    },
  });

  const header = [
    "workout_id",
    "workout_name",
    "started_at",
    "completed_at",
    "duration_seconds",
    "exercise_name",
    "set_number",
    "reps",
    "weight",
    "rpe",
    "is_warmup",
    "is_completed",
  ];

  const lines = [header.join(",")];

  for (const w of workouts) {
    for (const we of w.workoutExercises) {
      for (const s of we.sets) {
        lines.push(
          [
            csvCell(w.id),
            csvCell(w.name),
            csvCell(w.startedAt.toISOString()),
            csvCell(w.completedAt?.toISOString() ?? ""),
            csvCell(w.durationSeconds),
            csvCell(we.exercise.name),
            csvCell(s.setNumber),
            csvCell(s.reps),
            csvCell(s.weight),
            csvCell(s.rpe),
            csvCell(s.isWarmup),
            csvCell(s.isCompleted),
          ].join(",")
        );
      }
    }
  }

  const body = "\uFEFF" + lines.join("\n");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="fittrack-workouts.csv"',
    },
  });
}
