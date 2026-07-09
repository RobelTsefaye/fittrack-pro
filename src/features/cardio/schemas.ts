import { z } from "zod";

export const pushCardioLiveSampleSchema = z.object({
  isRunning: z.boolean(),
  heartRate: z.number().min(0).max(300),
  activeCalories: z.number().min(0),
  elapsedSeconds: z.number().int().min(0),
  zone: z.number().int().min(1).max(5).optional(),
});

export type PushCardioLiveSampleInput = z.infer<typeof pushCardioLiveSampleSchema>;
