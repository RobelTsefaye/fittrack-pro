import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "@/features/auth/schemas";
import { createExerciseSchema, updateExerciseSchema } from "@/features/exercises/schemas";
import {
  addPlanSessionExerciseSchema,
  createPlanSchema,
  updatePlanSchema,
  updatePlanSessionExerciseSchema,
  updatePlanSessionSchema,
} from "@/features/plans/schemas";
import { updateSettingsSchema } from "@/features/settings/schemas";
import { createBodyWeightSchema, updateBodyWeightSchema } from "@/features/tracking/schemas";
import {
  addExerciseToWorkoutSchema,
  addSetSchema,
  adjustRestTimerSchema,
  createWorkoutSchema,
  updateSetSchema,
  updateWorkoutSchema,
} from "@/features/workouts/schemas";
import {
  createNutritionPlanSchema,
  updateNutritionPlanSchema,
} from "@/features/health/nutrition-plan-schemas";
import { clampWeeks } from "@/features/ai/schemas";

/** Characterization der Zod-Schemas (Zod 4). Es wird nur Ist-Verhalten festgehalten. */

const UUID = "123e4567-e89b-42d3-a456-426614174000";
const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  s.safeParse(v).success;

describe("auth schemas", () => {
  it("loginSchema: E-Mail-Format und nicht-leeres Passwort", () => {
    expect(ok(loginSchema, { email: "a@b.de", password: "x" })).toBe(true);
    expect(ok(loginSchema, { email: "kein-mail", password: "x" })).toBe(false);
    expect(ok(loginSchema, { email: "a@b.de", password: "" })).toBe(false);
  });

  const valid = { name: "Ro", email: "a@b.de", password: "Abcdefg1", confirmPassword: "Abcdefg1" };
  it("registerSchema: gültiger Fall und je eine Regelverletzung", () => {
    expect(ok(registerSchema, valid)).toBe(true);
    expect(ok(registerSchema, { ...valid, name: "R" })).toBe(false);
    expect(ok(registerSchema, { ...valid, password: "Abcde1", confirmPassword: "Abcde1" })).toBe(
      false
    ); // < 8
    expect(
      ok(registerSchema, { ...valid, password: "abcdefg1", confirmPassword: "abcdefg1" })
    ).toBe(false); // Grossbuchstabe
    expect(
      ok(registerSchema, { ...valid, password: "Abcdefgh", confirmPassword: "Abcdefgh" })
    ).toBe(false); // Ziffer
  });

  it("registerSchema: Passwort-Mismatch meldet auf confirmPassword", () => {
    const r = registerSchema.safeParse({ ...valid, confirmPassword: "Other123" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(["confirmPassword"]);
      expect(r.error.issues[0].message).toBe("Passwords don't match");
    }
  });

  it("IST: kein Maximum für Passwortlänge (bcrypt kappt bei 72 Bytes) und kein trim beim Namen", () => {
    expect(
      ok(registerSchema, {
        ...valid,
        password: "A1" + "x".repeat(500),
        confirmPassword: "A1" + "x".repeat(500),
      })
    ).toBe(true);
    expect(ok(registerSchema, { ...valid, name: "  " })).toBe(true);
  });
});

describe("exercise schemas", () => {
  const base = { name: "Bankdrücken", muscleGroup: "CHEST", equipment: "BARBELL" };
  it("akzeptiert gültige Eingaben, leere Notes und lehnt unbekannte Enums ab", () => {
    expect(ok(createExerciseSchema, base)).toBe(true);
    expect(ok(createExerciseSchema, { ...base, notes: "" })).toBe(true);
    expect(ok(createExerciseSchema, { ...base, muscleGroup: "NECK" })).toBe(false);
    expect(ok(createExerciseSchema, { ...base, equipment: "barbell" })).toBe(false);
    expect(ok(createExerciseSchema, { ...base, name: "x" })).toBe(false);
    expect(ok(createExerciseSchema, { ...base, name: "x".repeat(101) })).toBe(false);
    expect(ok(createExerciseSchema, { ...base, notes: "x".repeat(501) })).toBe(false);
  });
  it("updateExerciseSchema ist partial, validiert aber vorhandene Felder", () => {
    expect(ok(updateExerciseSchema, {})).toBe(true);
    expect(ok(updateExerciseSchema, { name: "x" })).toBe(false);
  });
});

describe("plan schemas", () => {
  it("createPlan/updatePlan: Namenslängen, description null nur beim Update", () => {
    expect(ok(createPlanSchema, { name: "PPL" })).toBe(true);
    expect(ok(createPlanSchema, { name: "" })).toBe(false);
    expect(ok(createPlanSchema, { name: "x".repeat(121) })).toBe(false);
    expect(ok(createPlanSchema, { name: "a", description: null })).toBe(false);
    expect(ok(updatePlanSchema, { description: null })).toBe(true);
  });

  it("updatePlanSession: weekdays 0-6, höchstens 7; IST: Duplikate erlaubt (anders als Settings)", () => {
    expect(ok(updatePlanSessionSchema, { weekdays: [0, 6] })).toBe(true);
    expect(ok(updatePlanSessionSchema, { weekdays: [7] })).toBe(false);
    expect(ok(updatePlanSessionSchema, { weekdays: [-1] })).toBe(false);
    expect(ok(updatePlanSessionSchema, { weekdays: [0, 0, 1] })).toBe(true);
    expect(ok(updatePlanSessionSchema, { weekdays: [0, 1, 2, 3, 4, 5, 6, 0] })).toBe(false);
    expect(ok(updatePlanSessionSchema, { planId: "kein-uuid" })).toBe(false);
    expect(ok(updatePlanSessionSchema, { planId: UUID })).toBe(true);
  });

  it("addPlanSessionExercise: UUID Pflicht, targetSets 1..20", () => {
    expect(ok(addPlanSessionExerciseSchema, { exerciseId: UUID, targetSets: 20 })).toBe(true);
    expect(ok(addPlanSessionExerciseSchema, { exerciseId: UUID, targetSets: 21 })).toBe(false);
    expect(ok(addPlanSessionExerciseSchema, { exerciseId: UUID, targetSets: 0 })).toBe(false);
    expect(ok(addPlanSessionExerciseSchema, { exerciseId: "abc" })).toBe(false);
  });

  it("updatePlanSessionExercise: repMin <= repMax; null/ein Wert fehlend ist erlaubt", () => {
    const s = updatePlanSessionExerciseSchema;
    expect(ok(s, { repMin: 6, repMax: 10 })).toBe(true);
    expect(ok(s, { repMin: 8, repMax: 8 })).toBe(true);
    expect(ok(s, { repMin: 11, repMax: 10 })).toBe(false);
    expect(ok(s, { repMin: 11 })).toBe(true);
    expect(ok(s, { repMin: 11, repMax: null })).toBe(true);
    expect(ok(s, { restSeconds: 14 })).toBe(false);
    expect(ok(s, { restSeconds: null })).toBe(true);
  });
});

describe("settings schema", () => {
  it("Enums sind Grossbuchstaben", () => {
    expect(ok(updateSettingsSchema, { locale: "DE", weightUnit: "LB", theme: "SYSTEM" })).toBe(
      true
    );
    expect(ok(updateSettingsSchema, { locale: "de" })).toBe(false);
    expect(ok(updateSettingsSchema, { weightUnit: "kg" })).toBe(false);
  });

  it("trainingWeekdays/cardioWeekdays werden dedupliziert und sortiert", () => {
    const r = updateSettingsSchema.parse({
      trainingWeekdays: [4, 0, 4, 2],
      cardioWeekdays: [6, 6, 1],
    });
    expect(r.trainingWeekdays).toEqual([0, 2, 4]);
    expect(r.cardioWeekdays).toEqual([1, 6]);
  });

  it("Grenzen: restTimerDefault 30..600, Zeit 0..1439, Dauer >= 1, goalWeight nullable", () => {
    expect(ok(updateSettingsSchema, { restTimerDefault: 29 })).toBe(false);
    expect(ok(updateSettingsSchema, { restTimerDefault: 600 })).toBe(true);
    expect(ok(updateSettingsSchema, { restTimerDefault: 90.5 })).toBe(false);
    expect(ok(updateSettingsSchema, { trainingTimeMinutes: 1440 })).toBe(false);
    expect(ok(updateSettingsSchema, { trainingDurationMinutes: 0 })).toBe(false);
    expect(ok(updateSettingsSchema, { goalWeight: null })).toBe(true);
    expect(ok(updateSettingsSchema, { goalWeight: 0 })).toBe(false);
    expect(ok(updateSettingsSchema, { cardioLabel: "x".repeat(41) })).toBe(false);
  });

  it("unbekannte Felder werden verworfen (kein strict)", () => {
    const r = updateSettingsSchema.parse({ theme: "DARK", isAdmin: true });
    expect(r).toEqual({ theme: "DARK" });
  });
});

describe("tracking schemas", () => {
  it("createBodyWeight: Datum strikt, Gewicht > 0 und <= 999, Notes auch leer", () => {
    expect(ok(createBodyWeightSchema, { weight: 80.5, date: "2026-01-31" })).toBe(true);
    expect(ok(createBodyWeightSchema, { weight: 80, date: "2026-02-30" })).toBe(false);
    expect(ok(createBodyWeightSchema, { weight: 0, date: "2026-01-01" })).toBe(false);
    expect(ok(createBodyWeightSchema, { weight: 1000, date: "2026-01-01" })).toBe(false);
    expect(ok(createBodyWeightSchema, { weight: 80, date: "2026-01-01", notes: "" })).toBe(true);
    expect(ok(createBodyWeightSchema, { weight: "80", date: "2026-01-01" })).toBe(false); // keine Koerzierung
  });
  it("updateBodyWeight: notes null löscht, leeres Objekt ist gültig", () => {
    expect(ok(updateBodyWeightSchema, {})).toBe(true);
    expect(ok(updateBodyWeightSchema, { notes: null })).toBe(true);
    expect(ok(updateBodyWeightSchema, { weight: -1 })).toBe(false);
  });
});

describe("workout schemas", () => {
  it("createWorkout: planSessionId muss UUID sein, name <= 100", () => {
    expect(ok(createWorkoutSchema, {})).toBe(true);
    expect(ok(createWorkoutSchema, { planSessionId: UUID })).toBe(true);
    expect(ok(createWorkoutSchema, { planSessionId: "cl9abc" })).toBe(false);
    expect(ok(createWorkoutSchema, { name: "x".repeat(101) })).toBe(false);
  });

  it("IST: UUID-Prüfung (Zod 4) akzeptiert v1 und die Nil-UUID, lehnt falsche Variante und fehlende Bindestriche ab", () => {
    const s = addExerciseToWorkoutSchema;
    expect(ok(s, { exerciseId: UUID })).toBe(true);
    expect(ok(s, { exerciseId: "123e4567-e89b-12d3-a456-426614174000" })).toBe(true);
    expect(ok(s, { exerciseId: "00000000-0000-0000-0000-000000000000" })).toBe(true);
    expect(ok(s, { exerciseId: "123e4567-e89b-42d3-c456-426614174000" })).toBe(false);
    expect(ok(s, { exerciseId: "123e4567e89b42d3a456426614174000" })).toBe(false);
  });

  it("updateWorkout: name nullable, notes <= 1000, notes nicht nullable", () => {
    expect(ok(updateWorkoutSchema, { name: null })).toBe(true);
    expect(ok(updateWorkoutSchema, { notes: "x".repeat(1001) })).toBe(false);
    expect(ok(updateWorkoutSchema, { notes: null })).toBe(false);
  });

  it("adjustRestTimer: ganze Sekunden innerhalb +-3600", () => {
    expect(ok(adjustRestTimerSchema, { deltaSeconds: -3600 })).toBe(true);
    expect(ok(adjustRestTimerSchema, { deltaSeconds: 3601 })).toBe(false);
    expect(ok(adjustRestTimerSchema, { deltaSeconds: 1.5 })).toBe(false);
    expect(ok(adjustRestTimerSchema, {})).toBe(false);
  });

  it("addSet: Grenzen für reps/weight/rpe; IST: weight 0 und reps 0 erlaubt, rpe nicht nullable", () => {
    expect(ok(addSetSchema, { reps: 0, weight: 0 })).toBe(true);
    expect(ok(addSetSchema, { reps: 1000 })).toBe(false);
    expect(ok(addSetSchema, { weight: 10000 })).toBe(false);
    expect(ok(addSetSchema, { weight: -0.5 })).toBe(false);
    expect(ok(addSetSchema, { rpe: 0.5 })).toBe(false);
    expect(ok(addSetSchema, { rpe: 10 })).toBe(true);
    expect(ok(addSetSchema, { rpe: null })).toBe(false);
    expect(ok(addSetSchema, { durationSeconds: -1 })).toBe(false);
  });

  it("updateSet: erweitert addSet; rpe null löscht, isCompleted boolean", () => {
    expect(ok(updateSetSchema, { rpe: null, isCompleted: true })).toBe(true);
    expect(ok(updateSetSchema, { isCompleted: "true" })).toBe(false);
  });
});

describe("nutrition plan schemas", () => {
  const base = {
    phase: "CUT",
    startDate: "2026-01-05",
    startCalories: 2500,
    proteinPerKg: 2,
    fatPerKg: 0.8,
  };
  it("create: Defaults und Grenzen", () => {
    const r = createNutritionPlanSchema.parse(base);
    expect(r.weeklyCalorieStep).toBe(0);
    expect(ok(createNutritionPlanSchema, { ...base, startCalories: 799 })).toBe(false);
    expect(ok(createNutritionPlanSchema, { ...base, startCalories: 6001 })).toBe(false);
    expect(ok(createNutritionPlanSchema, { ...base, phase: "cut" })).toBe(false);
    expect(ok(createNutritionPlanSchema, { ...base, weeklyCalorieStep: 501 })).toBe(false);
    expect(ok(createNutritionPlanSchema, { ...base, proteinPerKg: 5.1 })).toBe(false);
    expect(ok(createNutritionPlanSchema, { ...base, startDate: "2026-13-01" })).toBe(false);
  });
  it("create: minCalories <= maxCalories, Fehlerpfad minCalories", () => {
    const r = createNutritionPlanSchema.safeParse({
      ...base,
      minCalories: 3000,
      maxCalories: 2000,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["minCalories"]);
    expect(ok(createNutritionPlanSchema, { ...base, minCalories: 2000, maxCalories: 2000 })).toBe(
      true
    );
    expect(ok(createNutritionPlanSchema, { ...base, minCalories: 2000 })).toBe(true);
  });
  it("update: phase/startDate sind nicht änderbar (werden verworfen); IST: min/max-Konsistenz wird nicht geprüft", () => {
    const r = updateNutritionPlanSchema.parse({
      phase: "BULK",
      startDate: "2026-02-01",
      notes: null,
    });
    expect(r).toEqual({ notes: null });
    expect(ok(updateNutritionPlanSchema, { minCalories: 3000, maxCalories: 2000 })).toBe(true);
  });
});

describe("clampWeeks", () => {
  it("Fallback bei null/NaN, Klammerung auf 1..max", () => {
    expect(clampWeeks(null, 8, 52)).toBe(8);
    expect(clampWeeks("abc", 8, 52)).toBe(8);
    expect(clampWeeks("0", 8, 52)).toBe(1);
    expect(clampWeeks("-5", 8, 52)).toBe(1);
    expect(clampWeeks("999", 8, 52)).toBe(52);
    expect(clampWeeks("12", 8, 52)).toBe(12);
  });
  it("IST: parseInt schneidet Suffixe ab ('12abc' -> 12, '3.9' -> 3); leerer String fällt auf Fallback", () => {
    expect(clampWeeks("12abc", 8, 52)).toBe(12);
    expect(clampWeeks("3.9", 8, 52)).toBe(3);
    expect(clampWeeks("", 8, 52)).toBe(8);
  });
});
