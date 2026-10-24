/**
 * Local-only demo data: a Push/Pull/Legs plan with ~6 weeks of completed
 * workouts, PRs and body weight for the given user email. Used to preview
 * the UI with realistic data. Never run against production.
 *
 *   npx tsx scripts/seed-demo.ts demo@fittrack.local
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { epley1RM } from "../src/lib/strength";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL!;
if (!/localhost|127\.0\.0\.1/.test(url)) {
  throw new Error("seed-demo only runs against a local database");
}
const prisma = new PrismaClient({ adapter: new PrismaPg(url) });

const PLAN: Record<string, [string, number, number][]> = {
  Push: [["Bench Press", 80, 6], ["Overhead Press", 45, 8], ["Incline Dumbbell Press", 28, 10], ["Lateral Raise", 10, 15], ["Tricep Pushdown", 30, 12]],
  Pull: [["Deadlift", 140, 5], ["Pull-Up", 0, 8], ["Barbell Row", 70, 8], ["Face Pull", 20, 15], ["Barbell Curl", 30, 10]],
  Legs: [["Squat", 110, 6], ["Romanian Deadlift", 90, 10], ["Leg Press", 180, 12], ["Leg Curl", 40, 12], ["Standing Calf Raise", 60, 15]],
};

async function main() {
  const email = process.argv[2] ?? "demo@fittrack.local";
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const exercises = await prisma.exercise.findMany({ where: { userId: null } });
  const byName = new Map(exercises.map((e) => [e.name, e]));
  const pick = (name: string) => {
    const e = byName.get(name) ?? exercises.find((x) => x.name.toLowerCase().includes(name.split(" ")[0]!.toLowerCase()));
    if (!e) throw new Error(`exercise ${name} missing`);
    return e;
  };

  await prisma.workout.deleteMany({ where: { userId: user.id } });
  await prisma.workoutPlan.deleteMany({ where: { userId: user.id } });
  await prisma.bodyWeight.deleteMany({ where: { userId: user.id } });

  const plan = await prisma.workoutPlan.create({
    data: {
      userId: user.id,
      name: "Push Pull Legs",
      description: "6-Tage Hypertrophie-Split",
      sessions: {
        create: Object.entries(PLAN).map(([name, list], order) => ({
          name,
          order,
          exercises: { create: list.map(([ex], i) => ({ exerciseId: pick(ex).id, order: i, targetSets: 3 })) },
        })),
      },
    },
    include: { sessions: true },
  });

  const now = new Date();
  const days = 42;
  let sessionIdx = 0;
  const best = new Map<string, number>();
  for (let d = days; d >= 1; d--) {
    if (d % 7 === 0 || d % 7 === 3) continue; // two rest days per week
    const session = plan.sessions[sessionIdx % plan.sessions.length]!;
    sessionIdx++;
    const progress = (days - d) / days; // 0 → 1 over the period
    const startedAt = new Date(now.getTime() - d * 86_400_000);
    startedAt.setHours(18, 0, 0, 0);
    const duration = 3600 + Math.round(Math.random() * 1200);
    const workout = await prisma.workout.create({
      data: {
        userId: user.id,
        name: session.name,
        planSessionId: session.id,
        startedAt,
        completedAt: new Date(startedAt.getTime() + duration * 1000),
        durationSeconds: duration,
      },
    });
    for (const [order, [name, base, reps]] of PLAN[session.name]!.entries()) {
      const ex = pick(name);
      const weight = base === 0 ? 0 : Math.round((base * (1 + 0.08 * progress)) / 2.5) * 2.5;
      const we = await prisma.workoutExercise.create({
        data: { workoutId: workout.id, exerciseId: ex.id, order, isCompleted: true },
      });
      for (let s = 1; s <= 3; s++) {
        const r = reps + (s === 1 ? 1 : 0) - (s === 3 ? 1 : 0);
        const set = await prisma.set.create({
          data: {
            workoutExerciseId: we.id,
            setNumber: s,
            reps: r,
            weight,
            isCompleted: true,
            completedAt: new Date(startedAt.getTime() + (order * 3 + s) * 180_000),
          },
        });
        const e1 = epley1RM(weight, r);
        if (e1 > (best.get(ex.id) ?? 0)) {
          best.set(ex.id, e1);
          await prisma.personalRecord.create({
            data: { userId: user.id, exerciseId: ex.id, weight, reps: r, estimated1RM: e1, setId: set.id },
          });
        }
      }
    }
  }

  for (let d = days; d >= 0; d--) {
    if (Math.random() < 0.2) continue;
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - d));
    await prisma.bodyWeight.create({
      data: { userId: user.id, date, weight: Math.round((78 + (days - d) * 0.03 + (Math.random() - 0.5) * 0.8) * 10) / 10 },
    });
  }
  console.log(`Seeded plan + ${sessionIdx} workouts for ${email}`);
}

main().finally(() => prisma.$disconnect());
