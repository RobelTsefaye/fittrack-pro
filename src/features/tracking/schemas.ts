import { z } from "zod";

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const createBodyWeightSchema = z.object({
  weight: z.number().positive().max(999),
  date: dateOnly,
  notes: z.string().max(500).optional().or(z.literal("")),
});

export const updateBodyWeightSchema = z.object({
  weight: z.number().positive().max(999).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export type CreateBodyWeightInput = z.infer<typeof createBodyWeightSchema>;
export type UpdateBodyWeightInput = z.infer<typeof updateBodyWeightSchema>;
