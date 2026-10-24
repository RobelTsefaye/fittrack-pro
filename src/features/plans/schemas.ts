import { z } from "zod";

export const createPlanSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

export const updatePlanSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
});

export const createPlanSessionSchema = z.object({
  name: z.string().min(1).max(100),
  notes: z.string().max(500).optional(),
});

export const updatePlanSessionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  notes: z.string().max(500).nullable().optional(),
  order: z.number().int().min(0).optional(),
});

export const addPlanSessionExerciseSchema = z.object({
  exerciseId: z.string().uuid(),
  targetSets: z.number().int().min(1).max(20).optional(),
});

export const updatePlanSessionExerciseSchema = z
  .object({
    targetSets: z.number().int().min(1).max(20).optional(),
    /** Target rep range for double progression; both null clears it. */
    repMin: z.number().int().min(1).max(100).nullable().optional(),
    repMax: z.number().int().min(1).max(100).nullable().optional(),
    /** Rest after this exercise in seconds; null = user default. */
    restSeconds: z.number().int().min(15).max(900).nullable().optional(),
  })
  .refine((d) => d.repMin == null || d.repMax == null || d.repMin <= d.repMax, {
    message: "repMin must be <= repMax",
    path: ["repMin"],
  });
