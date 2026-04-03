import { z } from "zod";

export const updateSettingsSchema = z.object({
  locale: z.enum(["EN", "DE"]).optional(),
  weightUnit: z.enum(["KG", "LB"]).optional(),
  theme: z.enum(["LIGHT", "DARK", "SYSTEM"]).optional(),
  restTimerDefault: z.number().int().min(30).max(600).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
