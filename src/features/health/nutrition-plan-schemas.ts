import { z } from "zod";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const createNutritionPlanSchema = z
  .object({
    phase: z.enum(["CUT", "REVERSE_DIET", "MAINTENANCE", "BULK"]),
    startDate: dateOnly,
    startCalories: z.number().int().min(800).max(6000),
    weeklyCalorieStep: z.number().int().min(-500).max(500).default(0),
    minCalories: z.number().int().min(800).max(6000).optional(),
    maxCalories: z.number().int().min(800).max(6000).optional(),
    proteinPerKg: z.number().positive().max(5),
    fatPerKg: z.number().positive().max(3),
    notes: z.string().max(500).optional(),
  })
  .refine((d) => !d.minCalories || !d.maxCalories || d.minCalories <= d.maxCalories, {
    message: "minCalories must be <= maxCalories",
    path: ["minCalories"],
  });

export type CreateNutritionPlanInput = z.infer<typeof createNutritionPlanSchema>;

// Corrections to the CURRENT row only — phase/startDate are immutable once
// set, since changing them would rewrite history rather than start a new one.
export const updateNutritionPlanSchema = z.object({
  startCalories: z.number().int().min(800).max(6000).optional(),
  weeklyCalorieStep: z.number().int().min(-500).max(500).optional(),
  minCalories: z.number().int().min(800).max(6000).nullable().optional(),
  maxCalories: z.number().int().min(800).max(6000).nullable().optional(),
  proteinPerKg: z.number().positive().max(5).optional(),
  fatPerKg: z.number().positive().max(3).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export type UpdateNutritionPlanInput = z.infer<typeof updateNutritionPlanSchema>;
