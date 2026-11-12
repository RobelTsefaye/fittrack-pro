import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FT-TEST-05: Fixtures für `buildHeuristicRecommendations` und `buildCoachContext` (ai/context.ts).
 * Prisma und die Dashboard-Abfragen sind gemockt; geprüft wird die Logik und die Vertragsform
 * (Nexus liest `coach-context`).
 */

const prisma = vi.hoisted(() => ({
  workout: { findFirst: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  personalRecord: { findFirst: vi.fn() },
  bodyWeight: { findFirst: vi.fn() },
  workoutPlan: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma }));

const q = vi.hoisted(() => ({
  getBodyWeightTrend: vi.fn(),
  getConsistencyWeekly: vi.fn(),
  getDashboardSummary: vi.fn(),
  getRecentPersonalRecords: vi.fn(),
  getTopExercisesByVolume: vi.fn(),
  getVolumeBucketsDaily: vi.fn(),
  getVolumeBucketsWeekly: vi.fn(),
}));
vi.mock("@/features/dashboard/queries", () => q);

const insights = vi.hoisted(() => ({ analyzeDeloadSignals: vi.fn(), analyzePlateaus: vi.fn() }));
vi.mock("@/features/dashboard/training-insights", () => insights);

const nutrition = vi.hoisted(() => ({ getNutritionTrend: vi.fn() }));
vi.mock("@/features/health/health-data", () => nutrition);

vi.mock("../week-stats", () => ({ getWorkingSetsCountWeekly: vi.fn() }));

const { buildHeuristicRecommendations, buildCoachContext } = await import("../context");

const NOW = new Date("2026-03-20T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  prisma.workout.findFirst.mockResolvedValue({ completedAt: daysAgo(1) });
  prisma.personalRecord.findFirst.mockResolvedValue(null);
  q.getVolumeBucketsWeekly.mockResolvedValue([]);
  q.getTopExercisesByVolume.mockResolvedValue([]);
  q.getDashboardSummary.mockResolvedValue({ workoutStreakDays: 0 });
  insights.analyzeDeloadSignals.mockResolvedValue([]);
  insights.analyzePlateaus.mockResolvedValue([]);
});

const ids = async () => (await buildHeuristicRecommendations("u1")).map((r) => r.id);

describe("buildHeuristicRecommendations", () => {
  it("ohne abgeschlossenes Training: nur no-history, keine weiteren Abfragen", async () => {
    prisma.workout.findFirst.mockResolvedValue(null);
    const out = await buildHeuristicRecommendations("u1");
    expect(out.map((r) => r.id)).toEqual(["no-history"]);
    expect(out[0]!.priority).toBe("info");
    expect(q.getVolumeBucketsWeekly).not.toHaveBeenCalled();
  });

  it("fragt das letzte Training nur für den eigenen Nutzer ab", async () => {
    await buildHeuristicRecommendations("u1");
    expect(prisma.workout.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", completedAt: { not: null } } })
    );
  });

  it("gestern trainiert, nichts auffällig: leere Liste", async () => {
    expect(await ids()).toEqual([]);
  });

  it.each([
    [6, []],
    [7, ["stale"]],
    [13, ["stale"]],
    [14, ["inactive"]],
    [40, ["inactive"]],
  ])("Pause von %i Tagen -> %j", async (days, expected) => {
    prisma.workout.findFirst.mockResolvedValue({ completedAt: daysAgo(days) });
    expect(await ids()).toEqual(expected);
  });

  it("inactive hat Priorität attention, stale suggest und nennt die Tage in basedOn", async () => {
    prisma.workout.findFirst.mockResolvedValue({ completedAt: daysAgo(20) });
    const [r] = await buildHeuristicRecommendations("u1");
    expect(r).toMatchObject({
      id: "inactive",
      priority: "attention",
      basedOn: "daysSinceLastWorkout=20",
    });
  });

  it("Volumenabfall: letzte 4 Wochen < 50 % der vorherigen 4 (und Vorblock > 100)", async () => {
    // Reihenfolge der Buckets: Index 0-3 = erster Block, 4-7 = zweiter (Ist-Logik)
    q.getVolumeBucketsWeekly.mockResolvedValue([
      ...Array(4).fill({ volume: 1000 }),
      ...Array(4).fill({ volume: 400 }),
    ]);
    expect(await ids()).toContain("volume-drop");
  });

  it("kein Volumenabfall bei Vorblock <= 100 oder genau 50 %", async () => {
    q.getVolumeBucketsWeekly.mockResolvedValue([
      ...Array(4).fill({ volume: 25 }),
      ...Array(4).fill({ volume: 0 }),
    ]);
    expect(await ids()).not.toContain("volume-drop");
    q.getVolumeBucketsWeekly.mockResolvedValue([
      ...Array(4).fill({ volume: 1000 }),
      ...Array(4).fill({ volume: 500 }),
    ]);
    expect(await ids()).not.toContain("volume-drop");
  });

  it("Rekord der letzten 7 Tage: pr-celebrate mit Übung und Gewicht x Wiederholungen", async () => {
    prisma.personalRecord.findFirst.mockResolvedValue({
      weight: 100,
      reps: 5,
      exercise: { name: "Bankdrücken" },
    });
    const out = await buildHeuristicRecommendations("u1");
    const pr = out.find((r) => r.id === "pr-celebrate")!;
    expect(pr.detail).toContain("Bankdrücken (100×5)");
    expect(prisma.personalRecord.findFirst.mock.calls[0]![0].where).toMatchObject({ userId: "u1" });
  });

  it("Volumenkonzentration ab 45 % Anteil der Top-Übung", async () => {
    q.getTopExercisesByVolume.mockResolvedValue([
      { name: "Kniebeuge", volume: 450 },
      { name: "A", volume: 300 },
      { name: "B", volume: 250 },
    ]);
    expect(await ids()).toContain("concentration");
    q.getTopExercisesByVolume.mockResolvedValue([
      { name: "Kniebeuge", volume: 440 },
      { name: "A", volume: 300 },
      { name: "B", volume: 260 },
    ]);
    expect(await ids()).not.toContain("concentration");
  });

  it("Streak ab 5 Tagen", async () => {
    q.getDashboardSummary.mockResolvedValue({ workoutStreakDays: 4 });
    expect(await ids()).not.toContain("streak");
    q.getDashboardSummary.mockResolvedValue({ workoutStreakDays: 5 });
    expect(await ids()).toContain("streak");
  });

  it("Deload-Signale und Plateaus werden abgebildet (id je Übung)", async () => {
    insights.analyzeDeloadSignals.mockResolvedValue([
      { reason: "high_frequency", workoutsLast21Days: 12, workoutsLast28Days: 15 },
      { reason: "grind", workoutsLast21Days: 9, workoutsLast28Days: 12 },
    ]);
    insights.analyzePlateaus.mockResolvedValue([
      { exerciseId: "e7", exerciseName: "Rudern", bestFirstHalf: 80, bestSecondHalf: 81 },
    ]);
    const out = await buildHeuristicRecommendations("u1");
    expect(out.map((r) => r.id)).toEqual(["deload-frequency", "deload-grind", "plateau-e7"]);
    expect(out[0]!.priority).toBe("attention");
    expect(out[2]!.detail).toContain("80 → 81");
  });
});

describe("buildCoachContext", () => {
  const session = (id: string, name: string, order: number) => ({
    id,
    name,
    order,
    exercises: [{ targetSets: 3, exercise: { name: "Kniebeuge" } }],
  });

  beforeEach(() => {
    prisma.bodyWeight.findFirst.mockResolvedValue(null);
    q.getBodyWeightTrend.mockResolvedValue([]);
    nutrition.getNutritionTrend.mockResolvedValue({ days: 0 });
    prisma.workout.findMany.mockResolvedValue([]);
    prisma.workoutPlan.findMany.mockResolvedValue([]);
    prisma.workout.groupBy.mockResolvedValue([]);
  });

  it("leerer Nutzer: Vertragsform stabil, Listen leer, primaryPlanId null, keine groupBy-Abfrage", async () => {
    const c = await buildCoachContext("u1");
    expect(c).toMatchObject({
      schemaVersion: "1.0",
      kind: "coach_context",
      generatedAt: NOW.toISOString(),
      latestBodyWeight: null,
      activeWorkouts: [],
      planRotation: [],
      primaryPlanId: null,
      recentCompletedWorkouts: [],
    });
    expect(Array.isArray(c.llmHints)).toBe(true);
    expect(prisma.workout.groupBy).not.toHaveBeenCalled();
  });

  it("alle Abfragen sind auf userId begrenzt", async () => {
    await buildCoachContext("u1");
    expect(prisma.bodyWeight.findFirst.mock.calls[0]![0].where).toEqual({ userId: "u1" });
    expect(prisma.workoutPlan.findMany.mock.calls[0]![0].where).toEqual({ userId: "u1" });
    for (const call of prisma.workout.findMany.mock.calls) {
      expect(call[0].where.userId).toBe("u1");
    }
    expect(q.getBodyWeightTrend).toHaveBeenCalledWith("u1", 90);
    expect(nutrition.getNutritionTrend).toHaveBeenCalledWith("u1", 90);
  });

  it("serialisiert Gewicht (Datum YYYY-MM-DD), aktive und abgeschlossene Workouts", async () => {
    prisma.bodyWeight.findFirst.mockResolvedValue({
      weight: 82.4,
      date: new Date("2026-03-19T00:00:00Z"),
      notes: "n",
    });
    prisma.workout.findMany
      .mockResolvedValueOnce([
        {
          id: "a1",
          name: "Push",
          startedAt: daysAgo(0),
          workoutExercises: [{ exercise: { name: "Bank" } }],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "c1",
          name: "Pull",
          completedAt: daysAgo(2),
          durationSeconds: 3600,
          planSessionId: "s1",
        },
      ]);
    const c = await buildCoachContext("u1");
    expect(c.latestBodyWeight).toEqual({ weight: 82.4, date: "2026-03-19", notes: "n" });
    expect(c.activeWorkouts).toEqual([
      { id: "a1", name: "Push", startedAt: NOW.toISOString(), exerciseNames: ["Bank"] },
    ]);
    expect(c.recentCompletedWorkouts[0]).toEqual({
      id: "c1",
      name: "Pull",
      completedAt: daysAgo(2).toISOString(),
      durationSeconds: 3600,
      planSessionId: "s1",
    });
  });

  it("Plan-Rotation: nie absolvierter Tag zuerst (nach order), sonst der am längsten zurückliegende", async () => {
    prisma.workoutPlan.findMany.mockResolvedValue([
      {
        id: "p1",
        name: "PPL",
        sessions: [session("s1", "Push", 0), session("s2", "Pull", 1), session("s3", "Legs", 2)],
      },
    ]);
    prisma.workout.groupBy.mockResolvedValue([
      { planSessionId: "s1", _max: { completedAt: daysAgo(2) } },
      { planSessionId: "s2", _max: { completedAt: daysAgo(5) } },
    ]);
    let c = await buildCoachContext("u1");
    expect(c.planRotation[0]!.suggestedNext).toMatchObject({
      planSessionId: "s3",
      sessionName: "Legs",
    });
    expect(c.planRotation[0]!.suggestedNext!.reason).toMatch(/No completed workout/);

    prisma.workout.groupBy.mockResolvedValue([
      { planSessionId: "s1", _max: { completedAt: daysAgo(2) } },
      { planSessionId: "s2", _max: { completedAt: daysAgo(5) } },
      { planSessionId: "s3", _max: { completedAt: daysAgo(3) } },
    ]);
    c = await buildCoachContext("u1");
    expect(c.planRotation[0]!.suggestedNext).toMatchObject({ planSessionId: "s2" });
    expect(c.planRotation[0]!.suggestedNext!.reason).toContain("2026-03-15");
    expect(c.primaryPlanId).toBe("p1");
    expect(c.planRotation[0]!.sessions.map((s) => s.lastCompletedAt)).toEqual([
      daysAgo(2).toISOString(),
      daysAgo(5).toISOString(),
      daysAgo(3).toISOString(),
    ]);
  });

  it("Gleichstand beim letzten Abschluss: kleinere order gewinnt; groupBy-Zeile ohne Datum zählt als nie", async () => {
    prisma.workoutPlan.findMany.mockResolvedValue([
      { id: "p1", name: "AB", sessions: [session("s1", "A", 0), session("s2", "B", 1)] },
    ]);
    prisma.workout.groupBy.mockResolvedValue([
      { planSessionId: "s1", _max: { completedAt: daysAgo(4) } },
      { planSessionId: "s2", _max: { completedAt: daysAgo(4) } },
    ]);
    expect((await buildCoachContext("u1")).planRotation[0]!.suggestedNext!.planSessionId).toBe(
      "s1"
    );
    prisma.workout.groupBy.mockResolvedValue([
      { planSessionId: "s1", _max: { completedAt: daysAgo(4) } },
      { planSessionId: "s2", _max: { completedAt: null } },
    ]);
    expect((await buildCoachContext("u1")).planRotation[0]!.suggestedNext!.planSessionId).toBe(
      "s2"
    );
  });

  it("Plan ohne Einheiten: suggestedNext null, sessions leer", async () => {
    prisma.workoutPlan.findMany.mockResolvedValue([{ id: "p1", name: "Leer", sessions: [] }]);
    const c = await buildCoachContext("u1");
    expect(c.planRotation[0]).toMatchObject({ planId: "p1", sessions: [], suggestedNext: null });
    expect(prisma.workout.groupBy).not.toHaveBeenCalled();
  });
});
