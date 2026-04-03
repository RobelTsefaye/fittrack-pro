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

export const updatePlanSessionExerciseSchema = z.object({
  targetSets: z.number().int().min(1).max(20).optional(),
});
