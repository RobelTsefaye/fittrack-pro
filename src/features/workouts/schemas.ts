import { z } from "zod";

export const createWorkoutSchema = z.object({
  name: z.string().max(100).optional(),
});

export const updateWorkoutSchema = z.object({
  name: z.string().max(100).nullable().optional(),
  notes: z.string().max(1000).optional(),
});

export const addExerciseToWorkoutSchema = z.object({
  exerciseId: z.string().uuid(),
});

export const adjustRestTimerSchema = z.object({
  deltaSeconds: z.number().int().min(-3600).max(3600),
});

export const addSetSchema = z.object({
  reps: z.number().int().min(0).max(999).optional(),
  weight: z.number().min(0).max(9999).optional(),
  durationSeconds: z.number().int().min(0).optional(),
  rpe: z.number().min(1).max(10).optional(),
  isWarmup: z.boolean().optional(),
});

export const updateSetSchema = addSetSchema.extend({
  isCompleted: z.boolean().optional(),
});

export type CreateWorkoutInput = z.infer<typeof createWorkoutSchema>;
export type UpdateWorkoutInput = z.infer<typeof updateWorkoutSchema>;
export type AddSetInput = z.infer<typeof addSetSchema>;
export type UpdateSetInput = z.infer<typeof updateSetSchema>;
