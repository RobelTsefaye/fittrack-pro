import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/** Verhaltenstests POST /api/workouts/[id]/exercises/[weId]/sets (FT-TEST-01), gemocktes Prisma/Auth. */

const prisma = vi.hoisted(() => ({
  workout: { findFirst: vi.fn() },
  workoutExercise: { findFirst: vi.fn() },
  set: {
    count: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma }));

const resolveUserId = vi.hoisted(() => vi.fn<() => Promise<string | null>>());
vi.mock("@/lib/api-auth", () => ({ resolveUserIdForDataApi: () => resolveUserId() }));

const { POST } = await import("@/app/api/workouts/[id]/exercises/[weId]/sets/route");

const ctx = { params: Promise.resolve({ id: "w1", weId: "we1" }) };
const req = (body: unknown) =>
  new Request("http://x/api/workouts/w1/exercises/we1/sets", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;

beforeEach(() => {
  vi.resetAllMocks();
  resolveUserId.mockResolvedValue("u1");
  prisma.workout.findFirst.mockResolvedValue({ id: "w1" });
  prisma.workoutExercise.findFirst.mockResolvedValue({ id: "we1" });
  prisma.set.findFirst.mockResolvedValue({ setNumber: 3 });
  prisma.set.create.mockImplementation(async (a: { data: object }) => ({ id: "new", ...a.data }));
  prisma.set.findMany.mockResolvedValue([]);
});

describe("POST /api/workouts/[id]/exercises/[weId]/sets", () => {
  it("ohne Session/Token: 401 und kein DB-Zugriff", async () => {
    resolveUserId.mockResolvedValue(null);
    expect((await POST(req({ reps: 5 }), ctx)).status).toBe(401);
    expect(prisma.workout.findFirst).not.toHaveBeenCalled();
    expect(prisma.set.create).not.toHaveBeenCalled();
  });

  it("Workout fremd oder bereits beendet: 404 (Filter userId + completedAt null)", async () => {
    prisma.workout.findFirst.mockResolvedValue(null);
    const res = await POST(req({ reps: 5 }), ctx);
    expect(res.status).toBe(404);
    expect(prisma.workout.findFirst).toHaveBeenCalledWith({
      where: { id: "w1", userId: "u1", completedAt: null },
    });
    expect(prisma.set.create).not.toHaveBeenCalled();
  });

  it("Übung gehört nicht zum Workout: 404", async () => {
    prisma.workoutExercise.findFirst.mockResolvedValue(null);
    const res = await POST(req({ reps: 5 }), ctx);
    expect(res.status).toBe(404);
    expect(prisma.workoutExercise.findFirst).toHaveBeenCalledWith({
      where: { id: "we1", workoutId: "w1" },
    });
    expect(prisma.set.create).not.toHaveBeenCalled();
  });

  it("ungültiges JSON: 400", async () => {
    expect((await POST(req("{nope"), ctx)).status).toBe(400);
    expect(prisma.set.create).not.toHaveBeenCalled();
  });

  it.each([
    ["reps zu groß", { reps: 1000 }],
    ["weight negativ", { weight: -1 }],
    ["rpe 0", { rpe: 0 }],
    ["durationSeconds negativ", { durationSeconds: -5 }],
  ])("Zod-Validierung: %s -> 400", async (_n, body) => {
    const res = await POST(req(body), ctx);
    expect(res.status).toBe(400);
    expect(prisma.set.create).not.toHaveBeenCalled();
  });

  it("Arbeitssatz: setNumber = letzte + 1, 201", async () => {
    const res = await POST(req({ reps: 5, weight: 80 }), ctx);
    expect(res.status).toBe(201);
    expect(prisma.set.findFirst).toHaveBeenCalledWith({
      where: { workoutExerciseId: "we1" },
      orderBy: { setNumber: "desc" },
    });
    expect(prisma.set.create).toHaveBeenCalledWith({
      data: { workoutExerciseId: "we1", setNumber: 4, reps: 5, weight: 80 },
    });
    expect((await res.json()).data.set).toMatchObject({ setNumber: 4 });
  });

  it("erster Satz ohne Vorgänger bekommt setNumber 1", async () => {
    prisma.set.findFirst.mockResolvedValue(null);
    await POST(req({}), ctx);
    expect(prisma.set.create.mock.calls[0]![0].data.setNumber).toBe(1);
  });

  it("Aufwärmsatz: vorhandene Sätze rücken um 1 nach hinten, neuer Satz bekommt Nummer 1, Antwort enthält alle Sätze", async () => {
    prisma.set.count.mockResolvedValue(2);
    prisma.set.findMany.mockResolvedValue([{ id: "new" }, { id: "a" }, { id: "b" }]);
    const res = await POST(req({ isWarmup: true, reps: 10, weight: 20 }), ctx);
    expect(res.status).toBe(201);
    expect(prisma.set.updateMany).toHaveBeenCalledWith({
      where: { workoutExerciseId: "we1" },
      data: { setNumber: { increment: 1 } },
    });
    expect(prisma.set.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ setNumber: 1, isWarmup: true, workoutExerciseId: "we1" }),
    });
    expect((await res.json()).data.sets).toHaveLength(3);
  });

  it("Aufwärmsatz ohne vorhandene Sätze: kein updateMany", async () => {
    prisma.set.count.mockResolvedValue(0);
    await POST(req({ isWarmup: true }), ctx);
    expect(prisma.set.updateMany).not.toHaveBeenCalled();
  });

  it("Prisma-Fehler wird nicht abgefangen, sondern nach oben gereicht (Next antwortet 500)", async () => {
    prisma.set.create.mockRejectedValue(new Error("db down"));
    await expect(POST(req({ reps: 5 }), ctx)).rejects.toThrow("db down");
  });
});
