import { prisma } from "@/lib/prisma";
import { epley1RM } from "@/lib/strength";

export async function recordPersonalRecordIfBest(params: {
  userId: string;
  exerciseId: string;
  setId: string;
  weight: number;
  reps: number;
}): Promise<{ recorded: boolean }> {
  const { userId, exerciseId, setId, weight, reps } = params;
  if (weight <= 0 || reps <= 0) return { recorded: false };

  const estimated1RM = epley1RM(weight, reps);
  if (estimated1RM <= 0) return { recorded: false };

  const existingForSet = await prisma.personalRecord.findUnique({
    where: { setId },
  });
  if (existingForSet) return { recorded: false };

  const best = await prisma.personalRecord.findFirst({
    where: { userId, exerciseId },
    orderBy: { estimated1RM: "desc" },
  });

  const bestVal = best?.estimated1RM ?? 0;
  if (bestVal > 0 && estimated1RM <= bestVal) {
    return { recorded: false };
  }

  await prisma.personalRecord.create({
    data: {
      userId,
      exerciseId,
      weight,
      reps,
      estimated1RM,
      setId,
    },
  });

  return { recorded: true };
}

export async function removePersonalRecordForSet(setId: string): Promise<void> {
  await prisma.personalRecord.deleteMany({ where: { setId } });
}
