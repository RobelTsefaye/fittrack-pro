import { z } from "zod";
import { dateOnlySchema } from "@/lib/date-only";

const dateOnly = dateOnlySchema;

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
