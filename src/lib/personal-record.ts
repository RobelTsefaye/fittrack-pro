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

/**
 * Gebündelte Variante von `recordPersonalRecordIfBest` für eine Satzliste in Reihenfolge
 * (z. B. beim Beenden eines Workouts): 1 Lese-Query für alle betroffenen Übungen,
 * Bestwerte im Speicher, 1 `createMany`. Gleiche Semantik wie die Einzelvariante:
 * Sätze mit weight/reps <= 0 zählen nicht, Sätze mit vorhandenem Rekord werden übersprungen,
 * Gleichstand ist kein Rekord, und ein späterer Satz tritt gegen den Bestwert inklusive der
 * in diesem Aufruf neu gesetzten Rekorde an. Ein vorhandener Rekord ohne e1RM (NULL) sortiert
 * in Postgres bei DESC zuerst; dann gilt der Bestwert wie bisher als 0.
 */
export async function recordPersonalRecordsInOrder(params: {
  userId: string;
  sets: { exerciseId: string; setId: string; weight: number; reps: number }[];
}): Promise<{ recordedSetIds: string[] }> {
  const { userId, sets } = params;
  const candidates = sets.filter(
    (s) => s.weight > 0 && s.reps > 0 && epley1RM(s.weight, s.reps) > 0
  );
  if (candidates.length === 0) return { recordedSetIds: [] };

  const exerciseIds = [...new Set(candidates.map((s) => s.exerciseId))];
  const existing = await prisma.personalRecord.findMany({
    where: { userId, exerciseId: { in: exerciseIds } },
    select: { setId: true, exerciseId: true, estimated1RM: true },
  });

  const existingSetIds = new Set(existing.map((r) => r.setId));
  const best = new Map<string, number>();
  const nullFirst = new Set<string>();
  for (const r of existing) {
    if (r.estimated1RM == null) nullFirst.add(r.exerciseId);
    else best.set(r.exerciseId, Math.max(best.get(r.exerciseId) ?? 0, r.estimated1RM));
  }

  const toCreate: {
    userId: string;
    exerciseId: string;
    weight: number;
    reps: number;
    estimated1RM: number;
    setId: string;
  }[] = [];
  for (const s of candidates) {
    if (existingSetIds.has(s.setId)) continue;
    const estimated1RM = epley1RM(s.weight, s.reps);
    const bestVal = nullFirst.has(s.exerciseId) ? 0 : (best.get(s.exerciseId) ?? 0);
    if (bestVal > 0 && estimated1RM <= bestVal) continue;
    toCreate.push({
      userId,
      exerciseId: s.exerciseId,
      weight: s.weight,
      reps: s.reps,
      estimated1RM,
      setId: s.setId,
    });
    existingSetIds.add(s.setId);
    if (!nullFirst.has(s.exerciseId)) best.set(s.exerciseId, estimated1RM);
  }

  if (toCreate.length > 0) await prisma.personalRecord.createMany({ data: toCreate });
  return { recordedSetIds: toCreate.map((r) => r.setId) };
}

export async function removePersonalRecordForSet(setId: string): Promise<void> {
  await prisma.personalRecord.deleteMany({ where: { setId } });
}
