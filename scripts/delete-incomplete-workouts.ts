/**
 * Deletes all in-progress workouts (completedAt IS NULL) and dependent rows (cascade).
 * Run: npx tsx scripts/delete-incomplete-workouts.ts
 * Requires DATABASE_URL or DIRECT_DATABASE_URL in .env
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const pending = await prisma.workout.count({ where: { completedAt: null } });
  console.log(`Incomplete workouts in DB: ${pending}`);
  if (pending === 0) {
    console.log("Nothing to delete.");
    return;
  }
  const result = await prisma.workout.deleteMany({
    where: { completedAt: null },
  });
  console.log(`Deleted ${result.count} workout(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
