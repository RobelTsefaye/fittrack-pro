import { prisma } from "@/lib/prisma";
import type { MuscleGroup } from "@/generated/prisma/client";

export type PREntry = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  weight: number;
  reps: number;
  estimated1RM: number | null;
  achievedAt: string; // ISO string
};

/**
 * Returns the best (highest estimated 1RM) personal record per exercise for a user.
 * Grouped by muscle group on the client side.
 */
export async function getAllPersonalRecords(userId: string): Promise<PREntry[]> {
  const records = await prisma.personalRecord.findMany({
    where: { userId },
    orderBy: { achievedAt: "desc" },
    include: {
      exercise: { select: { id: true, name: true, muscleGroup: true } },
    },
  });

  // Keep only the best PR per exercise (highest estimated1RM, then highest weight)
  const bestPerExercise = new Map<string, (typeof records)[number]>();
  for (const pr of records) {
    const existing = bestPerExercise.get(pr.exerciseId);
    if (!existing) {
      bestPerExercise.set(pr.exerciseId, pr);
    } else {
      const newE1rm = pr.estimated1RM ?? pr.weight;
      const curE1rm = existing.estimated1RM ?? existing.weight;
      if (newE1rm > curE1rm) {
        bestPerExercise.set(pr.exerciseId, pr);
      }
    }
  }

  return [...bestPerExercise.values()]
    .sort((a, b) => {
      // Sort by muscle group, then by estimated1RM desc
      const mg = a.exercise.muscleGroup.localeCompare(b.exercise.muscleGroup);
      if (mg !== 0) return mg;
      return (b.estimated1RM ?? b.weight) - (a.estimated1RM ?? a.weight);
    })
    .map((pr) => ({
      id: pr.id,
      exerciseId: pr.exerciseId,
      exerciseName: pr.exercise.name,
      muscleGroup: pr.exercise.muscleGroup,
      weight: pr.weight,
      reps: pr.reps,
      estimated1RM: pr.estimated1RM,
      achievedAt: pr.achievedAt.toISOString(),
    }));
}

export type AchievementId =
  | "firstWorkout"
  | "tenWorkouts"
  | "fiftyWorkouts"
  | "hundredWorkouts"
  | "firstPR"
  | "tenPRs"
  | "streak3"
  | "streak7"
  | "streak30"
  | "earlyBird";

export type Achievement = {
  id: AchievementId;
  unlocked: boolean;
  unlockedAt?: string;
};

export async function getAchievements(
  userId: string,
  streak: number
): Promise<Achievement[]> {
  const [totalWorkouts, totalPRs, earlyWorkout] = await Promise.all([
    prisma.workout.count({ where: { userId, completedAt: { not: null } } }),
    prisma.personalRecord.count({ where: { userId } }),
    // Early bird: any workout completed before 07:00 local time
    // We check hour < 7 in UTC — close enough for portfolios
    prisma.workout.findFirst({
      where: {
        userId,
        completedAt: { not: null },
      },
      select: { completedAt: true },
      orderBy: { completedAt: "asc" },
    }),
  ]);

  // Simple early-bird check: any workout started before 7am
  const earlyBirdUnlocked = earlyWorkout?.completedAt
    ? earlyWorkout.completedAt.getUTCHours() < 7
    : false;

  const results: Achievement[] = [
    { id: "firstWorkout",   unlocked: totalWorkouts >= 1 },
    { id: "tenWorkouts",    unlocked: totalWorkouts >= 10 },
    { id: "fiftyWorkouts",  unlocked: totalWorkouts >= 50 },
    { id: "hundredWorkouts",unlocked: totalWorkouts >= 100 },
    { id: "firstPR",        unlocked: totalPRs >= 1 },
    { id: "tenPRs",         unlocked: totalPRs >= 10 },
    { id: "streak3",        unlocked: streak >= 3 },
    { id: "streak7",        unlocked: streak >= 7 },
    { id: "streak30",       unlocked: streak >= 30 },
    { id: "earlyBird",      unlocked: earlyBirdUnlocked },
  ];

  return results;
}
