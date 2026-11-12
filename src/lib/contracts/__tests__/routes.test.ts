import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contract-Tests der FitTrack-Routen, die Nexus und die Nexus-iOS-App lesen (XR-API-06).
 * Die echten Route-Handler laufen mit gemocktem Prisma (kein DB-Zugriff, kein Netz);
 * die Antwort wird gegen die Zod-Schemas in `../fittrack-api.ts` geprüft und die
 * Schlüsselmenge gegen die eingefrorenen Fixtures. Kein Produktivcode wird geändert.
 */

const mocks = vi.hoisted(() => ({
  user: "user-fixture" as string | null,
  db: null as null | ReturnType<typeof import("./prisma-mock").createPrismaMock>,
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./prisma-mock");
  mocks.db = createPrismaMock();
  return { prisma: mocks.db.prisma };
});
vi.mock("@/lib/api-auth", () => ({ resolveUserIdForDataApi: async () => mocks.user }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (f: unknown) => f }));
vi.mock("@/features/calendar/schedule", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/calendar/schedule")>()),
  computeTrainingSchedule: vi.fn(async () => [
    { date: "2026-11-13", sourceDate: "2026-11-13", title: "Pull", notes: null, startMinutes: 1080, durationMinutes: 75 },
  ]),
  computeCardioSchedule: vi.fn(async () => []),
}));

import { GET as healthGet } from "@/app/api/ai/health/route";
import { GET as trainingGet } from "@/app/api/ai/training-summary/route";
import { GET as coachGet } from "@/app/api/ai/coach-context/route";
import { GET as workoutsGet } from "@/app/api/ai/workouts/route";
import { GET as calendarGet } from "@/app/api/ai/calendar/route";
import { GET as bwGet, POST as bwPost } from "@/app/api/body-weight/route";
import { DELETE as bwDelete } from "@/app/api/body-weight/[id]/route";
import { GET as exportGet } from "@/app/api/export/route";
import * as C from "../fittrack-api";
import healthFx from "../fixtures/health.json";
import healthEmptyFx from "../fixtures/health-no-data.json";
import trainingFx from "../fixtures/training-summary.json";
import coachFx from "../fixtures/coach-context.json";
import coachEmptyFx from "../fixtures/coach-context-empty.json";
import workoutsFx from "../fixtures/workouts.json";
import calendarFx from "../fixtures/calendar.json";
import bodyWeightFx from "../fixtures/body-weight.json";
import exportFx from "../fixtures/export.json";

const db = () => mocks.db!;
const call = async (handler: (req: NextRequest) => Promise<Response>, url: string, init?: RequestInit) => {
  const res = await handler(new NextRequest(`http://localhost${url}`, init as never));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const keys = (o: unknown) => Object.keys(o as object).sort();

beforeEach(() => {
  mocks.user = "user-fixture";
  db().reset();
});

/** Schlüsselmenge `data`/`meta` der echten Antwort gleich der des Fixtures (Feld hinzugekommen oder weggefallen?). */
function sameTopLevelKeys(actual: Record<string, unknown>, fixture: { data: unknown; meta?: unknown }) {
  expect(keys(actual.data)).toEqual(keys(fixture.data));
  if (fixture.meta) expect(keys(actual.meta)).toEqual(keys(fixture.meta));
}

const row = (date: string, extra: Record<string, unknown> = {}) => ({
  id: `snap-${date}`,
  userId: "user-fixture",
  date: new Date(`${date}T00:00:00.000Z`),
  sleepDuration: 7.4, sleepBedtime: "23:10", sleepWakeTime: "06:35", sleepDeepMinutes: 72, sleepRemMinutes: 101,
  sleepQuality: 82, restingHeartRate: 54, heartRateAvg: 68, hrv: 61.5, respiratoryRate: 14.2, wristTemperature: 35.6,
  steps: 9120, activeCalories: 540.5, exerciseMinutes: 48, standHours: 11, vo2Max: 46.1, calories: 1780,
  dietaryCalories: 2850, protein: 165, carbs: 330, fat: 85, fiber: 31, sugar: 60, sodium: 2300, caffeine: 180, water: 2600,
  vitaminD: null, vitaminC: null, calcium: null, iron: null, potassium: null, magnesium: null, mindfulMinutes: null,
  createdAt: new Date("2026-11-11T05:00:00Z"), updatedAt: new Date("2026-11-11T05:00:00Z"),
  ...extra,
});

describe("Auth-Vertrag aller konsumierten Routen", () => {
  const routes: Array<[string, (r: NextRequest) => Promise<Response>, string]> = [
    ["/api/ai/health", healthGet, "/api/ai/health"],
    ["/api/ai/training-summary", trainingGet, "/api/ai/training-summary"],
    ["/api/ai/coach-context", coachGet, "/api/ai/coach-context"],
    ["/api/ai/workouts", workoutsGet, "/api/ai/workouts"],
    ["/api/ai/calendar", calendarGet, "/api/ai/calendar"],
    ["/api/body-weight", bwGet, "/api/body-weight"],
    ["/api/export", exportGet as never, "/api/export"],
  ];
  it.each(routes)("%s ohne Anmeldung: 401 {error:'Unauthorized'}", async (_n, handler, url) => {
    mocks.user = null;
    const r = await call(handler, url);
    expect(r.status).toBe(401);
    expect(C.errorBody.parse(r.body)).toEqual({ error: "Unauthorized" });
  });
});

describe("GET /api/ai/health", () => {
  it("liefert Snapshots, Recovery und Verlauf im Vertragsformat (Fixture-Schlüssel gleich)", async () => {
    db().set("healthSnapshot.findMany", () => [row("2026-11-10"), row("2026-11-11")]);
    const r = await call(healthGet, "/api/ai/health?days=14");
    expect(r.status).toBe(200);
    const parsed = C.healthResponse.parse(r.body);
    expect(parsed.meta).toMatchObject({ endpoint: "health", days: 14, snapshotCount: 2 });
    sameTopLevelKeys(r.body, healthFx);
    expect(() => C.healthResponse.parse(healthFx)).not.toThrow();
  });

  it("recoveryHistory[].date ist YYYY-MM-DD", async () => {
    const today = new Date().toISOString().slice(0, 10);
    db().set("healthSnapshot.findMany", () => [row(today)]);
    const r = await call(healthGet, "/api/ai/health?days=3");
    const hist = (r.body.data as { recoveryHistory: Array<{ date: string }> }).recoveryHistory;
    for (const p of hist) expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("ohne Daten: leere Listen, recovery.score 0 und level 'none' (Ist-Zustand, XR-API-03)", async () => {
    const r = await call(healthGet, "/api/ai/health");
    const parsed = C.healthResponse.parse(r.body);
    expect(parsed.data.snapshots).toEqual([]);
    expect(parsed.data.recovery).toMatchObject({ score: 0, level: "none" });
    sameTopLevelKeys(r.body, healthEmptyFx);
    expect(() => C.healthResponse.parse(healthEmptyFx)).not.toThrow();
  });

  it("days wird auf 1–180 begrenzt, Standard 30", async () => {
    expect(((await call(healthGet, "/api/ai/health")).body.meta as { days: number }).days).toBe(30);
    expect(((await call(healthGet, "/api/ai/health?days=9999")).body.meta as { days: number }).days).toBe(180);
  });

  // Abweichung XR-API-06: kein Verhalten geändert, nur festgehalten. `it.fails` wird grün, sobald
  // FitTrack und Konsumenten gemeinsam auf YYYY-MM-DD normalisieren (dann `it.fails` -> `it`).
  it.fails("XR-API-06: snapshots[].date ist nur YYYY-MM-DD (heute voller ISO-String)", async () => {
    db().set("healthSnapshot.findMany", () => [row("2026-11-10")]);
    const r = await call(healthGet, "/api/ai/health");
    const snaps = (r.body.data as { snapshots: Array<{ date: string }> }).snapshots;
    expect(snaps[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("XR-API-06: snapshots[].date ist heute ein voller ISO-String (Konsumenten kürzen mit slice(0,10))", async () => {
    db().set("healthSnapshot.findMany", () => [row("2026-11-10")]);
    const r = await call(healthGet, "/api/ai/health");
    const snaps = (r.body.data as { snapshots: Array<{ date: string }> }).snapshots;
    expect(snaps[0]!.date).toBe("2026-11-10T00:00:00.000Z");
    expect(snaps[0]!.date.slice(0, 10)).toBe("2026-11-10");
  });

  it.fails("XR-API-03: recovery ist null, wenn level 'none' (heute score 0)", async () => {
    const r = await call(healthGet, "/api/ai/health");
    expect((r.body.data as { recovery: unknown }).recovery).toBeNull();
  });
});

describe("GET /api/ai/training-summary", () => {
  it("Vertragsformat inkl. snapshot.completedThisWeek/weeklyGoal/weekStreak (Fixture-Schlüssel gleich)", async () => {
    db().set("user.findUnique", () => ({ name: "Test Person", settings: { weightUnit: "KG", locale: "DE", restTimerDefault: 120 } }));
    db().set("bodyWeight.findMany", () => [
      { date: new Date("2026-11-10T00:00:00Z"), weight: 81.9 },
      { date: new Date("2026-11-03T00:00:00Z"), weight: 81.6 },
    ]);
    db().set("personalRecord.findMany", () => [
      { exerciseId: "ex-1", exercise: { id: "ex-1", name: "Kniebeuge" }, weight: 120, reps: 5, estimated1RM: 135, achievedAt: new Date("2026-11-09T17:30:00Z") },
    ]);
    // Zwei SQL-Abfragen: Volumen je Workout (GROUP BY w.id) und Top-Übungen.
    db().set("$queryRaw", (strings: TemplateStringsArray) =>
      strings.join("?").includes("GROUP BY w.id")
        ? [{ completedAt: new Date(), volume: 11000 }]
        : [{ exerciseId: "ex-1", name: "Kniebeuge", volume: 15200.5 }]
    );
    const r = await call(trainingGet, "/api/ai/training-summary?weeks=2");
    expect(r.status).toBe(200);
    const parsed = C.trainingSummaryResponse.parse(r.body);
    expect(parsed.data.athlete.displayName).toBe("Test Person");
    expect(parsed.data.window.weekBuckets.length).toBeGreaterThanOrEqual(2);
    expect(parsed.meta.weeks).toBe(2);
    sameTopLevelKeys(r.body, trainingFx);
    expect(() => C.trainingSummaryResponse.parse(trainingFx)).not.toThrow();
  });

  it("ohne Nutzername: displayName fällt auf 'Athlete' zurück, Einheit KG", async () => {
    const r = await call(trainingGet, "/api/ai/training-summary");
    const parsed = C.trainingSummaryResponse.parse(r.body);
    expect(parsed.data.athlete).toMatchObject({ displayName: "Athlete", weightUnit: "KG" });
    expect(parsed.meta.weeks).toBe(8);
  });

  it("weeks wird auf 1–24 begrenzt", async () => {
    expect(((await call(trainingGet, "/api/ai/training-summary?weeks=500")).body.meta as { weeks: number }).weeks).toBe(24);
  });
});

describe("GET /api/ai/coach-context", () => {
  it("Vertragsformat mit Plan-Rotation (Fixture-Schlüssel gleich)", async () => {
    db().set("bodyWeight.findFirst", () => ({ weight: 81.9, date: new Date("2026-11-10T00:00:00Z"), notes: null }));
    db().set("workout.findMany", (arg: { where: { completedAt: unknown } }) =>
      arg.where.completedAt === null
        ? []
        : [{ id: "w-1", name: "Push", completedAt: new Date("2026-11-09T18:20:00Z"), durationSeconds: 3900, planSessionId: "ps-1" }]
    );
    db().set("workoutPlan.findMany", () => [
      { id: "plan-1", name: "Push Pull Legs", sessions: [{ id: "ps-1", name: "Push", order: 0, exercises: [{ targetSets: 4, exercise: { name: "Bankdrücken" } }] }] },
    ]);
    db().set("workout.groupBy", () => [{ planSessionId: "ps-1", _max: { completedAt: new Date("2026-11-09T18:20:00Z") } }]);
    const r = await call(coachGet, "/api/ai/coach-context");
    expect(r.status).toBe(200);
    const parsed = C.coachContextResponse.parse(r.body);
    expect(parsed.data.latestBodyWeight).toEqual({ weight: 81.9, date: "2026-11-10", notes: null });
    expect(parsed.data.planRotation[0]!.suggestedNext!.sessionName).toBe("Push");
    sameTopLevelKeys(r.body, coachFx);
    expect(() => C.coachContextResponse.parse(coachFx)).not.toThrow();
  });

  it("ohne Daten: latestBodyWeight ist null, Listen leer (Nexus liest `coach?.latestBodyWeight`)", async () => {
    const r = await call(coachGet, "/api/ai/coach-context");
    const parsed = C.coachContextResponse.parse(r.body);
    expect(parsed.data.latestBodyWeight).toBeNull();
    expect(parsed.data.planRotation).toEqual([]);
    sameTopLevelKeys(r.body, coachEmptyFx);
    expect(() => C.coachContextResponse.parse(coachEmptyFx)).not.toThrow();
  });
});

describe("GET /api/ai/workouts", () => {
  it("Vertragsformat: Sätze nur mit id, Paging in meta (Fixture-Schlüssel gleich)", async () => {
    const w = (id: string, completed: boolean) => ({
      id, name: completed ? "Push" : null,
      startedAt: new Date("2026-11-09T17:15:00Z"), completedAt: completed ? new Date("2026-11-09T18:20:00Z") : null,
      durationSeconds: completed ? 3900 : null,
      workoutExercises: [{ exercise: { id: "ex-2", name: "Bankdrücken", muscleGroup: "CHEST" }, sets: [{ id: "s1", weight: 100, reps: 5 }] }],
    });
    db().set("workout.findMany", () => [w("w-1", true), w("w-2", false)]);
    db().set("workout.count", () => 2);
    const r = await call(workoutsGet, "/api/ai/workouts");
    const parsed = C.workoutsResponse.parse(r.body);
    expect(parsed.meta).toEqual({ endpoint: "workouts", page: 1, limit: 20, total: 2, status: null });
    expect(parsed.data.workouts[0]!.workoutExercises[0]!.sets).toEqual([{ id: "s1" }]);
    sameTopLevelKeys(r.body, workoutsFx);
    expect(() => C.workoutsResponse.parse(workoutsFx)).not.toThrow();
  });

  it("limit ist höchstens 100, status nur active|completed", async () => {
    const r = await call(workoutsGet, "/api/ai/workouts?limit=5000&status=bogus");
    expect(r.body.meta).toMatchObject({ limit: 100, status: null });
    const c = await call(workoutsGet, "/api/ai/workouts?status=completed");
    expect(c.body.meta).toMatchObject({ status: "completed" });
  });
});

describe("GET /api/ai/calendar", () => {
  it("Vertragsformat mit aktivem Training, `today` aus der Anfrage (Fixture-Schlüssel gleich)", async () => {
    db().set("userSettings.findUnique", () => ({ calendarSyncEnabled: true, cardioSyncEnabled: false }));
    const r = await call(calendarGet, "/api/ai/calendar?today=2026-11-12");
    const parsed = C.calendarResponse.parse(r.body);
    expect(parsed.meta).toEqual({ endpoint: "calendar", today: "2026-11-12", horizonDays: 28 });
    expect(parsed.data.training.events[0]).toMatchObject({ date: "2026-11-13", startMinutes: 1080 });
    expect(parsed.data.cardio).toEqual({ enabled: false, events: [] });
    sameTopLevelKeys(r.body, calendarFx);
    expect(() => C.calendarResponse.parse(calendarFx)).not.toThrow();
  });

  it("ohne today: UTC-Datum des Servers (Ist-Zustand, XR-API-04); ungültiges today: 400 {error}", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-11T23:30:00Z"));
      const r = await call(calendarGet, "/api/ai/calendar");
      expect((r.body.meta as { today: string }).today).toBe("2026-11-11");
    } finally {
      vi.useRealTimers();
    }
    const bad = await call(calendarGet, "/api/ai/calendar?today=12.11.2026");
    expect(bad.status).toBe(400);
    expect(C.errorBody.parse(bad.body).error).toMatch(/today/);
  });

  it("horizonDays wird auf 1–56 begrenzt", async () => {
    expect(((await call(calendarGet, "/api/ai/calendar?horizonDays=999")).body.data as { horizonDays: number }).horizonDays).toBe(56);
  });
});

describe("/api/body-weight (Nexus liest und schreibt Gewicht)", () => {
  const entry = (id: string, date: string, weight: number, notes: string | null = null) => ({
    id, userId: "user-fixture", weight, date: new Date(`${date}T00:00:00Z`), notes, createdAt: new Date(`${date}T06:40:00Z`),
  });

  it("GET: { data: [...] } mit date als YYYY-MM-DD, absteigend angefragt (Fixture-Form)", async () => {
    db().set("bodyWeight.findMany", () => [entry("a", "2026-11-10", 81.9), entry("b", "2026-11-03", 81.6, "morgens")]);
    const r = await call(bwGet, "/api/body-weight");
    const parsed = C.bodyWeightListResponse.parse(r.body);
    expect(parsed.data.map((e) => e.date)).toEqual(["2026-11-10", "2026-11-03"]);
    expect(db().calls("bodyWeight.findMany")[0]![0]).toMatchObject({ orderBy: { date: "desc" } });
    expect(keys(parsed.data[0])).toEqual(keys(bodyWeightFx.data[0]));
    expect(() => C.bodyWeightListResponse.parse(bodyWeightFx)).not.toThrow();
  });

  it("GET mit ungültigem from: 400 {error}", async () => {
    const r = await call(bwGet, "/api/body-weight?from=gestern");
    expect(r.status).toBe(400);
    C.errorBody.parse(r.body);
  });

  it("POST: Upsert je Tag, Antwort { data: Eintrag }; leere Notiz wird null", async () => {
    db().set("bodyWeight.upsert", (arg: { create: { date: Date; weight: number; notes: string | null } }) =>
      entry("new", arg.create.date.toISOString().slice(0, 10), arg.create.weight, arg.create.notes)
    );
    const r = await call(bwPost, "/api/body-weight", {
      method: "POST",
      body: JSON.stringify({ weight: 82.5, date: "2026-11-11", notes: "" }),
      headers: { "content-type": "application/json" },
    });
    expect(r.status).toBe(200);
    expect(C.bodyWeightWriteResponse.parse(r.body).data).toMatchObject({ weight: 82.5, date: "2026-11-11", notes: null });
    expect(db().calls("bodyWeight.upsert")[0]![0]).toMatchObject({ where: { userId_date: { userId: "user-fixture" } } });
  });

  it("POST mit ungültigem Gewicht oder Datum: 400 {error: erste Meldung}, kein Schreibzugriff", async () => {
    for (const body of [{ weight: -1, date: "2026-11-11" }, { weight: 80, date: "11.11.2026" }, { date: "2026-11-11" }]) {
      const r = await call(bwPost, "/api/body-weight", {
        method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
      });
      expect(r.status).toBe(400);
      expect(typeof C.errorBody.parse(r.body).error).toBe("string");
    }
    expect(db().calls("bodyWeight.upsert")).toHaveLength(0);
  });

  it("DELETE: { success: true }, fremde/unbekannte id: 404 {error}", async () => {
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
    const del = (id: string) => (bwDelete as unknown as (r: NextRequest, c: ReturnType<typeof ctx>) => Promise<Response>)(
      new NextRequest(`http://localhost/api/body-weight/${id}`, { method: "DELETE" }), ctx(id));
    db().set("bodyWeight.findFirst", () => entry("a", "2026-11-10", 81.9));
    const ok = await del("a");
    expect(ok.status).toBe(200);
    C.deleteResponse.parse(await ok.json());
    db().set("bodyWeight.findFirst", () => null);
    const nf = await del("zzz");
    expect(nf.status).toBe(404);
    C.errorBody.parse(await nf.json());
  });
});

describe("GET /api/export", () => {
  it("{ data: Nutzer mit bodyWeights/workouts/personalRecords, meta } (Fixture-Form)", async () => {
    db().set("user.findUnique", () => ({
      ...exportFx.data,
      createdAt: new Date(exportFx.data.createdAt),
      updatedAt: new Date(exportFx.data.updatedAt),
      bodyWeights: exportFx.data.bodyWeights.map((b) => ({ ...b, date: new Date(b.date), createdAt: new Date(b.createdAt) })),
      workouts: exportFx.data.workouts.map((w) => ({ ...w, startedAt: new Date(w.startedAt), completedAt: new Date(w.completedAt) })),
    }));
    const r = await call(exportGet as never, "/api/export");
    expect(r.status).toBe(200);
    C.exportResponse.parse(r.body);
    expect(keys((r.body.data as object))).toEqual(keys(exportFx.data));
    expect(r.body.meta).toMatchObject({ format: "json" });
    expect(() => C.exportResponse.parse(exportFx)).not.toThrow();
  });

  it("unbekannter Nutzer: 404 {error}", async () => {
    const r = await call(exportGet as never, "/api/export");
    expect(r.status).toBe(404);
    C.errorBody.parse(r.body);
  });
});

describe("`kind` je Endpunkt (XR-API-06: Schreibweise uneinheitlich)", () => {
  const root = join(process.cwd(), "src");
  const aiDir = join(root, "app/api/ai");
  const contextSrc = readFileSync(join(root, "features/ai/context.ts"), "utf8");
  const kindOf = (endpoint: string): string | null => {
    const route = readFileSync(join(aiDir, endpoint, "route.ts"), "utf8");
    const m = route.match(/kind:\s*"([^"]+)"/);
    if (m) return m[1]!;
    const ctx = [...contextSrc.matchAll(/kind:\s*"([^"]+)"\s+as const/g)].map((x) => x[1]!);
    const want = endpoint.replace(/-/g, "_");
    return ctx.find((k) => k === want) ?? null;
  };

  it("KIND_BY_ENDPOINT deckt alle /api/ai-Endpunkte ab und stimmt mit dem Quelltext überein", () => {
    const endpoints = readdirSync(aiDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    expect(Object.keys(C.KIND_BY_ENDPOINT).sort()).toEqual(endpoints);
    for (const e of endpoints) expect(kindOf(e), e).toBe(C.KIND_BY_ENDPOINT[e as keyof typeof C.KIND_BY_ENDPOINT]);
  });

  it.fails("XR-API-06: `kind` ist einheitlich geschrieben (Bindestrich, wie in der Doku `training-summary`)", () => {
    for (const [endpoint, kind] of Object.entries(C.KIND_BY_ENDPOINT)) expect(kind).toBe(endpoint);
  });
});
