import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionUrl =
  process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL!;
const adapter = new PrismaPg(connectionUrl);
const prisma = new PrismaClient({ adapter });

type MuscleGroup =
  | "CHEST"
  | "BACK"
  | "SHOULDERS"
  | "BICEPS"
  | "TRICEPS"
  | "LEGS"
  | "GLUTES"
  | "CORE"
  | "FOREARMS"
  | "CALVES"
  | "FULL_BODY"
  | "CARDIO";

type Equipment =
  | "BARBELL"
  | "DUMBBELL"
  | "MACHINE"
  | "CABLE"
  | "BODYWEIGHT"
  | "KETTLEBELL"
  | "BAND";

const defaultExercises: {
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
}[] = [
  // Chest
  { name: "Bench Press", muscleGroup: "CHEST", equipment: "BARBELL" },
  { name: "Incline Bench Press", muscleGroup: "CHEST", equipment: "BARBELL" },
  { name: "Dumbbell Bench Press", muscleGroup: "CHEST", equipment: "DUMBBELL" },
  { name: "Incline Dumbbell Press", muscleGroup: "CHEST", equipment: "DUMBBELL" },
  { name: "Cable Fly", muscleGroup: "CHEST", equipment: "CABLE" },
  { name: "Chest Dip", muscleGroup: "CHEST", equipment: "BODYWEIGHT" },
  { name: "Push-Up", muscleGroup: "CHEST", equipment: "BODYWEIGHT" },
  { name: "Machine Chest Press", muscleGroup: "CHEST", equipment: "MACHINE" },
  { name: "Pec Deck", muscleGroup: "CHEST", equipment: "MACHINE" },

  // Back
  { name: "Deadlift", muscleGroup: "BACK", equipment: "BARBELL" },
  { name: "Barbell Row", muscleGroup: "BACK", equipment: "BARBELL" },
  { name: "Pull-Up", muscleGroup: "BACK", equipment: "BODYWEIGHT" },
  { name: "Chin-Up", muscleGroup: "BACK", equipment: "BODYWEIGHT" },
  { name: "Lat Pulldown", muscleGroup: "BACK", equipment: "CABLE" },
  { name: "Seated Cable Row", muscleGroup: "BACK", equipment: "CABLE" },
  { name: "Dumbbell Row", muscleGroup: "BACK", equipment: "DUMBBELL" },
  { name: "T-Bar Row", muscleGroup: "BACK", equipment: "BARBELL" },
  { name: "Face Pull", muscleGroup: "BACK", equipment: "CABLE" },

  // Shoulders
  { name: "Overhead Press", muscleGroup: "SHOULDERS", equipment: "BARBELL" },
  { name: "Dumbbell Shoulder Press", muscleGroup: "SHOULDERS", equipment: "DUMBBELL" },
  { name: "Lateral Raise", muscleGroup: "SHOULDERS", equipment: "DUMBBELL" },
  { name: "Front Raise", muscleGroup: "SHOULDERS", equipment: "DUMBBELL" },
  { name: "Reverse Fly", muscleGroup: "SHOULDERS", equipment: "DUMBBELL" },
  { name: "Arnold Press", muscleGroup: "SHOULDERS", equipment: "DUMBBELL" },
  { name: "Cable Lateral Raise", muscleGroup: "SHOULDERS", equipment: "CABLE" },

  // Biceps
  { name: "Barbell Curl", muscleGroup: "BICEPS", equipment: "BARBELL" },
  { name: "Dumbbell Curl", muscleGroup: "BICEPS", equipment: "DUMBBELL" },
  { name: "Hammer Curl", muscleGroup: "BICEPS", equipment: "DUMBBELL" },
  { name: "Preacher Curl", muscleGroup: "BICEPS", equipment: "BARBELL" },
  { name: "Cable Curl", muscleGroup: "BICEPS", equipment: "CABLE" },
  { name: "Incline Dumbbell Curl", muscleGroup: "BICEPS", equipment: "DUMBBELL" },

  // Triceps
  { name: "Tricep Pushdown", muscleGroup: "TRICEPS", equipment: "CABLE" },
  { name: "Overhead Tricep Extension", muscleGroup: "TRICEPS", equipment: "DUMBBELL" },
  { name: "Skull Crusher", muscleGroup: "TRICEPS", equipment: "BARBELL" },
  { name: "Close-Grip Bench Press", muscleGroup: "TRICEPS", equipment: "BARBELL" },
  { name: "Tricep Dip", muscleGroup: "TRICEPS", equipment: "BODYWEIGHT" },
  { name: "Cable Overhead Extension", muscleGroup: "TRICEPS", equipment: "CABLE" },

  // Legs
  { name: "Squat", muscleGroup: "LEGS", equipment: "BARBELL" },
  { name: "Front Squat", muscleGroup: "LEGS", equipment: "BARBELL" },
  { name: "Leg Press", muscleGroup: "LEGS", equipment: "MACHINE" },
  { name: "Leg Extension", muscleGroup: "LEGS", equipment: "MACHINE" },
  { name: "Leg Curl", muscleGroup: "LEGS", equipment: "MACHINE" },
  { name: "Romanian Deadlift", muscleGroup: "LEGS", equipment: "BARBELL" },
  { name: "Bulgarian Split Squat", muscleGroup: "LEGS", equipment: "DUMBBELL" },
  { name: "Hack Squat", muscleGroup: "LEGS", equipment: "MACHINE" },
  { name: "Goblet Squat", muscleGroup: "LEGS", equipment: "DUMBBELL" },
  { name: "Lunge", muscleGroup: "LEGS", equipment: "DUMBBELL" },

  // Glutes
  { name: "Hip Thrust", muscleGroup: "GLUTES", equipment: "BARBELL" },
  { name: "Glute Bridge", muscleGroup: "GLUTES", equipment: "BODYWEIGHT" },
  { name: "Cable Kickback", muscleGroup: "GLUTES", equipment: "CABLE" },
  { name: "Sumo Deadlift", muscleGroup: "GLUTES", equipment: "BARBELL" },

  // Core
  { name: "Plank", muscleGroup: "CORE", equipment: "BODYWEIGHT" },
  { name: "Hanging Leg Raise", muscleGroup: "CORE", equipment: "BODYWEIGHT" },
  { name: "Cable Crunch", muscleGroup: "CORE", equipment: "CABLE" },
  { name: "Ab Wheel Rollout", muscleGroup: "CORE", equipment: "BODYWEIGHT" },
  { name: "Russian Twist", muscleGroup: "CORE", equipment: "BODYWEIGHT" },

  // Calves
  { name: "Standing Calf Raise", muscleGroup: "CALVES", equipment: "MACHINE" },
  { name: "Seated Calf Raise", muscleGroup: "CALVES", equipment: "MACHINE" },

  // Forearms
  { name: "Wrist Curl", muscleGroup: "FOREARMS", equipment: "BARBELL" },
  { name: "Reverse Wrist Curl", muscleGroup: "FOREARMS", equipment: "BARBELL" },
  { name: "Farmer's Walk", muscleGroup: "FOREARMS", equipment: "DUMBBELL" },

  // Cardio
  { name: "Treadmill Running", muscleGroup: "CARDIO", equipment: "MACHINE" },
  { name: "Rowing Machine", muscleGroup: "CARDIO", equipment: "MACHINE" },
  { name: "Cycling", muscleGroup: "CARDIO", equipment: "MACHINE" },
  { name: "Jump Rope", muscleGroup: "CARDIO", equipment: "BODYWEIGHT" },
];

async function main() {
  console.log("Seeding default exercises...");

  const existing = await prisma.exercise.count({
    where: { isCustom: false },
  });

  if (existing > 0) {
    console.log(`Already have ${existing} default exercises, skipping seed.`);
    return;
  }

  for (const exercise of defaultExercises) {
    await prisma.exercise.create({
      data: {
        ...exercise,
        isCustom: false,
        userId: null,
      },
    });
  }

  console.log(`Seeded ${defaultExercises.length} default exercises.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await (prisma as unknown as { $disconnect: () => Promise<void> }).$disconnect();
  });
