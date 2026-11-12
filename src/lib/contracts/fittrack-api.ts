import { z } from "zod";

/**
 * Vertragsschemas (XR-API-06): Antwortformen der FitTrack-Routen, die Nexus
 * (Server, Mobile-API) und die Nexus-iOS-App (`FitTrackClient`) lesen.
 *
 * Nur Beschreibung des IST-Zustands, kein Laufzeitcode: Die Routen importieren
 * diese Datei nicht. Die Schemas sind absichtlich `looseObject` (zusätzliche
 * Felder sind erlaubt, FitTrack darf erweitern); Pflichtfelder und Typen sind
 * der Vertrag. Ein Umbenennen oder Typwechsel macht die Contract-Tests rot.
 * Die gleichen Fixtures liegen im Nexus-Repo unter `tests/fixtures/fittrack/`.
 */

/** `YYYY-MM-DD` (Kalendertag, kein Zeitanteil). */
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Voller ISO-Zeitstempel eines JSON-serialisierten `Date`. */
export const isoDateTime = z.iso.datetime();
const num = z.number();
const numOrNull = z.number().nullable();
const strOrNull = z.string().nullable();

export const errorBody = z.looseObject({ error: z.string() });
export const schemaVersion = z.literal("1.0");

/** Wrapper `{ data, meta }` der `/api/ai/*`-Routen. */
export const envelope = <T extends z.ZodType, M extends z.ZodType>(data: T, meta: M) =>
  z.looseObject({ data, meta });

// ── GET /api/ai/health ──────────────────────────────────────────────────────

/**
 * XR-API-06: `snapshots[].date` ist heute ein VOLLER ISO-String (JSON-Roundtrip
 * eines `Date`, `health-data.ts`), `recoveryHistory[].date` dagegen nur
 * `YYYY-MM-DD`. Das Schema akzeptiert beide Formen, damit eine spätere
 * Normalisierung (zusammen mit den Konsumenten) den Vertrag nicht bricht.
 */
export const snapshotDate = z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z)?$/);

export const healthSnapshot = z.looseObject({
  id: z.string(),
  date: snapshotDate,
  sleepDuration: numOrNull,
  sleepBedtime: strOrNull,
  sleepWakeTime: strOrNull,
  sleepDeepMinutes: numOrNull,
  sleepRemMinutes: numOrNull,
  sleepQuality: numOrNull,
  restingHeartRate: numOrNull,
  heartRateAvg: numOrNull,
  hrv: numOrNull,
  respiratoryRate: numOrNull,
  wristTemperature: numOrNull,
  steps: numOrNull,
  activeCalories: numOrNull,
  exerciseMinutes: numOrNull,
  standHours: numOrNull,
  vo2Max: numOrNull,
  dietaryCalories: numOrNull,
  protein: numOrNull,
  carbs: numOrNull,
  fat: numOrNull,
});

export const recoveryLevel = z.enum(["high", "mid", "low", "none"]);

/**
 * XR-API-03: Ohne Daten liefert FitTrack `score: 0, level: "none"` (kein `null`).
 * Konsumenten müssen `level === "none"` als „keine Daten“ behandeln.
 */
export const recoveryBreakdown = z.looseObject({
  score: num,
  level: recoveryLevel,
  sleepScore: numOrNull,
  hrScore: numOrNull,
  hrvScore: numOrNull,
  loadScore: numOrNull,
  activityScore: numOrNull,
  trends: z.looseObject({
    hrTrend: z.enum(["rising", "stable", "falling"]).nullable(),
    hrvTrend: z.enum(["rising", "stable", "falling"]).nullable(),
  }),
  baseline: z.looseObject({ daysOfData: num }),
  illnessWarning: z.looseObject({ active: z.boolean(), signals: z.array(z.string()) }),
});

export const recoveryHistoryPoint = z.looseObject({ date: dateOnly, score: num, level: recoveryLevel });

export const healthResponse = envelope(
  z.looseObject({
    schemaVersion,
    kind: z.literal("health"),
    generatedAt: isoDateTime,
    snapshots: z.array(healthSnapshot),
    recovery: recoveryBreakdown,
    recoveryHistory: z.array(recoveryHistoryPoint),
  }),
  z.looseObject({ endpoint: z.literal("health"), days: num, snapshotCount: num })
);

// ── GET /api/ai/training-summary ────────────────────────────────────────────

const weightPoint = z.looseObject({ date: dateOnly, weight: num });

export const nutritionTrend = z.looseObject({
  days: z.array(z.looseObject({ date: dateOnly, dietaryCalories: numOrNull, protein: numOrNull, carbs: numOrNull, fat: numOrNull })),
  loggedDays: num,
  averages: z.looseObject({ dietaryCalories: numOrNull, protein: numOrNull, carbs: numOrNull, fat: numOrNull }),
  macroSplit: z.looseObject({ proteinPct: numOrNull, carbsPct: numOrNull, fatPct: numOrNull }).nullable(),
});

/** Kennzahlen der Woche: Nexus `mobile.js` liest `completedThisWeek`, `weeklyGoal`, `weekStreak`. */
export const dashboardSnapshot = z.looseObject({
  totalWorkouts: num,
  completedThisWeek: num,
  completedThisMonth: num,
  personalRecordsCount: num,
  workoutStreakDays: num,
  weeklyGoal: num,
  weekStreak: num,
});

export const trainingSummaryResponse = envelope(
  z.looseObject({
    schemaVersion,
    /** Unterstrich, anders als `personal-records`/`cardio-history` (XR-API-06). */
    kind: z.literal("training_summary"),
    generatedAt: isoDateTime,
    windowWeeks: num,
    athlete: z.looseObject({
      displayName: z.string(),
      weightUnit: z.enum(["KG", "LB"]),
      locale: z.string(),
      defaultRestSeconds: num,
    }),
    snapshot: dashboardSnapshot,
    window: z.looseObject({
      weekBuckets: z.array(
        z.looseObject({ weekStart: dateOnly, completedWorkouts: num, volumeLoad: num, workingSets: num })
      ),
      dailyVolume: z.array(z.looseObject({ date: dateOnly, volume: num })),
      totals: z.looseObject({ completedWorkouts: num, workingSets: num, volumeLoad: num }),
    }),
    bodyWeightTrend: z.array(weightPoint),
    nutrition: nutritionTrend,
    topExercisesByVolume: z.array(z.looseObject({ exerciseId: z.string(), name: z.string(), volumeLoad: num })),
    recentPersonalRecords: z.array(
      z.looseObject({
        exerciseId: z.string(),
        exerciseName: z.string(),
        weight: num,
        reps: num,
        estimated1RM: num,
        achievedAt: isoDateTime,
      })
    ),
  }),
  z.looseObject({ endpoint: z.literal("training-summary"), weeks: num })
);

// ── GET /api/ai/coach-context ───────────────────────────────────────────────

const plannedExercise = z.looseObject({ name: z.string(), targetSets: num });

export const coachContextResponse = envelope(
  z.looseObject({
    schemaVersion,
    kind: z.literal("coach_context"),
    generatedAt: isoDateTime,
    /** `null` ohne Gewichtseintrag; Nexus liest `.weight` und `.date`. */
    latestBodyWeight: z.looseObject({ weight: num, date: dateOnly, notes: strOrNull }).nullable(),
    bodyWeightTrend: z.array(weightPoint),
    nutrition: nutritionTrend,
    activeWorkouts: z.array(
      z.looseObject({ id: z.string(), name: strOrNull, startedAt: isoDateTime, exerciseNames: z.array(z.string()) })
    ),
    planRotation: z.array(
      z.looseObject({
        planId: z.string(),
        planName: z.string(),
        sessions: z.array(
          z.looseObject({
            id: z.string(),
            name: z.string(),
            order: num,
            lastCompletedAt: isoDateTime.nullable(),
            plannedExercises: z.array(plannedExercise),
          })
        ),
        suggestedNext: z
          .looseObject({
            planSessionId: z.string(),
            sessionName: z.string(),
            reason: z.string(),
            plannedExercises: z.array(plannedExercise),
          })
          .nullable(),
      })
    ),
    primaryPlanId: strOrNull,
    recentCompletedWorkouts: z.array(
      z.looseObject({
        id: z.string(),
        name: strOrNull,
        completedAt: isoDateTime,
        durationSeconds: numOrNull,
        planSessionId: strOrNull,
      })
    ),
    llmHints: z.array(z.string()),
  }),
  z.looseObject({ endpoint: z.literal("coach-context") })
);

// ── GET /api/ai/workouts ────────────────────────────────────────────────────

export const workoutsResponse = envelope(
  z.looseObject({
    schemaVersion,
    kind: z.literal("workouts"),
    generatedAt: isoDateTime,
    workouts: z.array(
      z.looseObject({
        id: z.string(),
        name: strOrNull,
        startedAt: isoDateTime,
        completedAt: isoDateTime.nullable(),
        durationSeconds: numOrNull,
        workoutExercises: z.array(
          z.looseObject({
            exercise: z.looseObject({ id: z.string(), name: z.string() }),
            /** Nur `id`, keine Gewichte/Wiederholungen. */
            sets: z.array(z.looseObject({ id: z.string() })),
          })
        ),
      })
    ),
  }),
  z.looseObject({
    endpoint: z.literal("workouts"),
    page: num,
    limit: num,
    total: num,
    status: z.enum(["active", "completed"]).nullable(),
  })
);

// ── GET /api/ai/calendar ────────────────────────────────────────────────────

export const calendarEntry = z.looseObject({
  date: dateOnly,
  sourceDate: dateOnly,
  title: z.string(),
  notes: strOrNull,
  startMinutes: num,
  durationMinutes: num,
});

export const calendarResponse = envelope(
  z.looseObject({
    schemaVersion,
    kind: z.literal("calendar"),
    generatedAt: isoDateTime,
    horizonDays: num,
    training: z.looseObject({ enabled: z.boolean(), events: z.array(calendarEntry) }),
    cardio: z.looseObject({ enabled: z.boolean(), events: z.array(calendarEntry) }),
  }),
  /** `today` ohne Parameter = UTC-Datum des Servers (XR-API-04). */
  z.looseObject({ endpoint: z.literal("calendar"), today: dateOnly, horizonDays: num })
);

// ── /api/body-weight ────────────────────────────────────────────────────────

export const bodyWeightEntry = z.looseObject({
  id: z.string(),
  weight: num,
  date: dateOnly,
  notes: strOrNull,
  createdAt: isoDateTime,
});

/** `POST`/`PATCH`: ein Eintrag (Upsert je Tag); `DELETE`: `{ success: true }`. */
export const bodyWeightWriteResponse = z.looseObject({ data: bodyWeightEntry });
export const deleteResponse = z.looseObject({ success: z.literal(true) });

/** Absteigend nach Datum, ohne Limit. */
export const bodyWeightListResponse = z.looseObject({ data: z.array(bodyWeightEntry) });

// ── GET /api/export ─────────────────────────────────────────────────────────

export const exportResponse = z.looseObject({
  data: z.looseObject({
    id: z.string(),
    email: z.string(),
    name: strOrNull,
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
    /** Rohzeilen der DB: `date` ist hier ein voller ISO-String (anders als bei `/api/body-weight`). */
    bodyWeights: z.array(z.looseObject({ id: z.string(), weight: num, date: snapshotDate, notes: strOrNull })),
    exercises: z.array(z.looseObject({ id: z.string() })),
    workouts: z.array(z.looseObject({ id: z.string(), startedAt: isoDateTime, workoutExercises: z.array(z.looseObject({})) })),
    personalRecords: z.array(z.looseObject({ id: z.string(), exercise: z.looseObject({ id: z.string(), name: z.string() }) })),
  }),
  meta: z.looseObject({ exportedAt: isoDateTime, format: z.literal("json") }),
});

/**
 * `kind`-Werte je Endpunkt (Ist-Zustand). XR-API-06: uneinheitlich
 * (Unterstrich bei den drei Builder-Routen, Bindestrich sonst).
 */
export const KIND_BY_ENDPOINT = {
  "training-summary": "training_summary",
  "coach-context": "coach_context",
  "progress-report": "progress_report",
  health: "health",
  workouts: "workouts",
  calendar: "calendar",
  "personal-records": "personal-records",
  "cardio-history": "cardio-history",
  "body-measurements": "body-measurements",
  recommendations: "recommendations",
  plans: "plans",
  exercises: "exercises",
  settings: "settings",
  "exercise-history": "exercise-history",
} as const;
