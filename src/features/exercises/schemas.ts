import { z } from "zod";

export const createExerciseSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  muscleGroup: z.enum([
    "CHEST",
    "BACK",
    "SHOULDERS",
    "BICEPS",
    "TRICEPS",
    "LEGS",
    "GLUTES",
    "CORE",
    "FOREARMS",
    "CALVES",
    "FULL_BODY",
    "CARDIO",
    "OTHER",
  ]),
  equipment: z.enum([
    "BARBELL",
    "DUMBBELL",
    "MACHINE",
    "CABLE",
    "BODYWEIGHT",
    "KETTLEBELL",
    "BAND",
    "OTHER",
  ]),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export const updateExerciseSchema = createExerciseSchema.partial();

export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;
export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;
