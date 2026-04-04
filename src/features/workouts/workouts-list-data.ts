import { unstable_cache } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { workoutsListCacheTag } from "@/lib/constants";

const listInclude = {
  workoutExercises: {
    include: {
      exercise: { select: { id: true, name: true, muscleGroup: true } },
      sets: true,
    },
    orderBy: { order: "asc" as const },
  },
} satisfies Prisma.WorkoutInclude;

type WorkoutListRow = Prisma.WorkoutGetPayload<{ include: typeof listInclude }>;

/** Serializable shape for workouts list UI + API (matches prior /api/workouts JSON). */
export type WorkoutListItemDTO = {
  id: string;
  name: string | null;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  workoutExercises: {
    exercise: { id: string; name: string };
    sets: { id: string }[];
  }[];
};

function serializeWorkout(row: WorkoutListRow): WorkoutListItemDTO {
  return {
    id: row.id,
    name: row.name,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    durationSeconds: row.durationSeconds,
    workoutExercises: row.workoutExercises.map((we) => ({
      exercise: { id: we.exercise.id, name: we.exercise.name },
      sets: we.sets.map((s) => ({ id: s.id })),
    })),
  };
}

async function queryWorkoutsList(
  userId: string,
  opts: { limit: number; skip: number; status: "active" | "completed" | null }
): Promise<{ rows: WorkoutListRow[]; total: number }> {
  const where: Prisma.WorkoutWhereInput = { userId };
  if (opts.status === "active") {
    where.completedAt = null;
  } else if (opts.status === "completed") {
    where.completedAt = { not: null };
  }

  const [rows, total] = await Promise.all([
    prisma.workout.findMany({
      where,
      include: listInclude,
      orderBy: { startedAt: "desc" },
      skip: opts.skip,
      take: opts.limit,
    }),
    prisma.workout.count({ where }),
  ]);

  return { rows, total };
}

/** Uncached — used for filtered/paginated API requests. */
export async function getWorkoutsListUncached(
  userId: string,
  page: number,
  limit: number,
  status: "active" | "completed" | null
): Promise<{ items: WorkoutListItemDTO[]; total: number }> {
  const skip = (page - 1) * limit;
  const { rows, total } = await queryWorkoutsList(userId, { limit, skip, status });
  return {
    items: rows.map((r) => serializeWorkout(r)),
    total,
  };
}

/**
 * Cached list for default workouts page (first page, limit 50, all statuses).
 * Same tag invalidation as dashboard for workout/body mutations.
 */
export async function getCachedWorkoutsListPage(userId: string): Promise<{
  items: WorkoutListItemDTO[];
  total: number;
}> {
  return unstable_cache(
    async () => {
      const { rows, total } = await queryWorkoutsList(userId, {
        limit: 50,
        skip: 0,
        status: null,
      });
      return {
        items: rows.map((r) => serializeWorkout(r)),
        total,
      };
    },
    ["workouts-list-page", userId],
    { revalidate: 45, tags: [workoutsListCacheTag(userId)] }
  )();
}
