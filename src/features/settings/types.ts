import { DEFAULT_REST_TIMER } from "@/lib/constants";

export type InitialSettings = {
  locale: "EN" | "DE";
  weightUnit: "KG" | "LB";
  theme: "LIGHT" | "DARK" | "SYSTEM";
  restTimerDefault: number;
  calendarSyncEnabled: boolean;
  trainingWeekdays: number[];
  trainingTimeMinutes: number;
  trainingDurationMinutes: number;
  cardioSyncEnabled: boolean;
  cardioWeekdays: number[];
  cardioTimeMinutes: number;
  cardioDurationMinutes: number;
  cardioLabel: string;
};

export const DEFAULT_SETTINGS: InitialSettings = {
  locale: "EN", weightUnit: "KG", theme: "SYSTEM", restTimerDefault: DEFAULT_REST_TIMER,
  calendarSyncEnabled: false, trainingWeekdays: [], trainingTimeMinutes: 1080, trainingDurationMinutes: 90,
  cardioSyncEnabled: false, cardioWeekdays: [], cardioTimeMinutes: 1080, cardioDurationMinutes: 45, cardioLabel: "",
};
