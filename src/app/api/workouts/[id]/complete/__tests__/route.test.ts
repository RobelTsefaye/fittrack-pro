import { beforeEach, describe, expect, it, vi } from "vitest";

/** POST /api/workouts/[id]/complete: nur Auth-Charakterisierung; belegte Findings als todo (FT-TEST-01). */

const prisma = vi.hoisted(() => ({
  workout: { findFirst: vi.fn(), update: vi.fn() },
  set: { findMany: vi.fn(), updateMany: vi.fn() },
  personalRecord: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
  },
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma }));

const resolveUserId = vi.hoisted(() => vi.fn<() => Promise<string | null>>());
vi.mock("@/lib/api-auth", () => ({ resolveUserIdForDataApi: () => resolveUserId() }));

const { POST } = await import("@/app/api/workouts/[id]/complete/route");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/workouts/[id]/complete", () => {
  it("ohne Session/Token: 401 und kein DB-Zugriff", async () => {
    resolveUserId.mockResolvedValue(null);
    const res = await POST(
      new Request("http://x/api/workouts/w1/complete", { method: "POST" }) as never,
      { params: Promise.resolve({ id: "w1" }) } as never
    );
    expect(res.status).toBe(401);
    expect(prisma.workout.findFirst).not.toHaveBeenCalled();
  });

  it("FT-PERF-01: PR-Queries sind unabhängig von der Satzzahl (kein N+1), Rampe setzt mehrere Rekorde", async () => {
    resolveUserId.mockResolvedValue("u1");
    const startedAt = new Date("2026-01-01T10:00:00Z");
    prisma.workout.findFirst
      .mockResolvedValueOnce({ id: "w1", startedAt })
      .mockResolvedValueOnce(null);
    prisma.workout.update.mockResolvedValue({ id: "w1" });
    const sets = Array.from({ length: 25 }, (_, i) => ({
      id: `s${i}`,
      weight: 40 + i * 2,
      reps: 5,
      workoutExercise: { exerciseId: `e${i % 3}` },
    }));
    prisma.set.findMany.mockImplementation(async (args: { include?: unknown }) =>
      args.include ? sets : []
    );
    prisma.personalRecord.findMany.mockImplementation(async (args: { select: object }) =>
      "setId" in args.select ? [] : []
    );
    prisma.personalRecord.createMany.mockResolvedValue({ count: 25 });

    const res = await POST(
      new Request("http://x/api/workouts/w1/complete", { method: "POST" }) as never,
      { params: Promise.resolve({ id: "w1" }) } as never
    );
    expect(res.status).toBe(200);
    expect((await res.json()).newPersonalRecords).toBe(25);
    // Kein Einzelzugriff je Satz, genau ein Bündel-Insert.
    expect(prisma.personalRecord.findUnique).not.toHaveBeenCalled();
    expect(prisma.personalRecord.findFirst).not.toHaveBeenCalled();
    expect(prisma.personalRecord.create).not.toHaveBeenCalled();
    expect(prisma.personalRecord.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.personalRecord.createMany.mock.calls[0][0].data).toHaveLength(25);
    // Reihenfolge der Sätze im Workout ist festgelegt.
    const prCall = prisma.set.findMany.mock.calls.find((c) => c[0].include)!;
    expect(prCall[0].orderBy).toEqual([
      { workoutExercise: { order: "asc" } },
      { setNumber: "asc" },
      { id: "asc" },
    ]);
  });
  it.todo(
    "FT-PERF-05: bis zu 7 sequentielle Queries je Satz-PATCH (Query-Anzahl festschreiben, bevor optimiert wird)"
  );
});
