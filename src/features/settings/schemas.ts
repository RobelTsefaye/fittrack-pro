import { z } from "zod";

export const updateSettingsSchema = z.object({
  locale: z.enum(["EN", "DE"]).optional(),
  weightUnit: z.enum(["KG", "LB"]).optional(),
  theme: z.enum(["LIGHT", "DARK", "SYSTEM"]).optional(),
  restTimerDefault: z.number().int().min(30).max(600).optional(),
  calendarSyncEnabled: z.boolean().optional(),
  trainingWeekdays: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .transform((a) => [...new Set(a)].sort((x, y) => x - y))
    .optional(),
  trainingTimeMinutes: z.number().int().min(0).max(1439).optional(),
  trainingDurationMinutes: z.number().int().min(1).max(1439).optional(),
  cardioSyncEnabled: z.boolean().optional(),
  cardioWeekdays: z.array(z.number().int().min(0).max(6)).max(7).transform((a) => [...new Set(a)].sort((x, y) => x - y)).optional(),
  cardioTimeMinutes: z.number().int().min(0).max(1439).optional(),
  cardioDurationMinutes: z.number().int().min(1).max(1439).optional(),
  cardioLabel: z.string().max(40).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
