import { prisma } from "@/lib/prisma";
import type { ExerciseData } from "./components/exercise-card";

/** Server-side fetch in the `GET /api/exercises` shape (built-in + own). */
export async function getExercises(
  userId: string,
  filters: { muscleGroup?: string | null; equipment?: string | null; search?: string | null } = {}
): Promise<ExerciseData[]> {
  const where: Record<string, unknown> = {
    OR: [{ userId: null }, { userId }],
  };
  if (filters.muscleGroup && filters.muscleGroup !== "ALL") where.muscleGroup = filters.muscleGroup;
  if (filters.equipment && filters.equipment !== "ALL") where.equipment = filters.equipment;
  if (filters.search) where.name = { contains: filters.search, mode: "insensitive" };

  const exercises = await prisma.exercise.findMany({
    where,
    orderBy: [{ isCustom: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      muscleGroup: true,
      equipment: true,
      notes: true,
      isCustom: true,
    },
  });
  return exercises;
}
