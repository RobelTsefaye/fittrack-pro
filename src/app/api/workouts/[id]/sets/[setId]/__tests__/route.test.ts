import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Verhaltenstests PATCH/DELETE /api/workouts/[id]/sets/[setId] (FT-TEST-01) mit gemocktem Prisma/Auth.
 * Der PR-Abgleich (src/lib/personal-record.ts) läuft echt, nur Prisma ist gemockt.
 * FT-ERR-02: Satz-Update, Timer-Reset und PR-Abgleich (bzw. DELETE) laufen in einer $transaction.
 * Der $transaction-Mock simuliert Rollback: Schreibzugriffe werden protokolliert und bei einem Fehler verworfen.
 */

const prisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  set: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  workout: { update: vi.fn() },
  personalRecord: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma }));

const resolveUserId = vi.hoisted(() => vi.fn<() => Promise<string | null>>());
vi.mock("@/lib/api-auth", () => ({ resolveUserIdForDataApi: () => resolveUserId() }));

const { PATCH, DELETE } = await import("@/app/api/workouts/[id]/sets/[setId]/route");

const ctx = { params: Promise.resolve({ id: "w1", setId: "s1" }) };
const patchReq = (body: unknown) =>
  new Request("http://x/api/workouts/w1/sets/s1", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
const delReq = () =>
  new Request("http://x/api/workouts/w1/sets/s1", { method: "DELETE" }) as unknown as NextRequest;

const OWNED_WHERE = {
  id: "s1",
  workoutExercise: { workoutId: "w1", workout: { userId: "u1" } },
};

const existingSet = (over: object = {}) => ({
  id: "s1",
  isCompleted: false,
  workoutExercise: { exerciseId: "e1" },
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  resolveUserId.mockResolvedValue("u1");
  prisma.set.findFirst.mockResolvedValue(existingSet());
  prisma.set.update.mockImplementation(async (args: { data: object }) => ({
    id: "s1",
    isCompleted: false,
    isWarmup: false,
    weight: null,
    reps: null,
    ...args.data,
  }));
  prisma.workout.update.mockResolvedValue({});
  prisma.personalRecord.deleteMany.mockResolvedValue({ count: 0 });
  prisma.personalRecord.findUnique.mockResolvedValue(null);
  prisma.personalRecord.findFirst.mockResolvedValue(null);
  prisma.personalRecord.create.mockResolvedValue({});
  // Callback-Form: tx = dieselben Mocks; Array-Form: Promises bereits gestartet, nur abwarten.
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as unknown[])
  );
});

describe("PATCH /api/workouts/[id]/sets/[setId]", () => {
  it("ohne Session/Token: 401 und kein DB-Zugriff", async () => {
    resolveUserId.mockResolvedValue(null);
    const res = await PATCH(patchReq({ reps: 5 }), ctx);
    expect(res.status).toBe(401);
    expect(prisma.set.findFirst).not.toHaveBeenCalled();
    expect(prisma.set.update).not.toHaveBeenCalled();
  });

  it("fremder/unbekannter Satz: 404, Eigentümerprüfung über userId, kein Schreibzugriff", async () => {
    prisma.set.findFirst.mockResolvedValue(null);
    const res = await PATCH(patchReq({ reps: 5 }), ctx);
    expect(res.status).toBe(404);
    expect(prisma.set.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: OWNED_WHERE })
    );
    expect(prisma.set.update).not.toHaveBeenCalled();
    expect(prisma.personalRecord.deleteMany).not.toHaveBeenCalled();
  });

  it("ungültiges JSON: 400", async () => {
    const res = await PATCH(patchReq("{nope"), ctx);
    expect(res.status).toBe(400);
    expect(prisma.set.update).not.toHaveBeenCalled();
  });

  it.each([
    ["reps negativ", { reps: -1 }],
    ["reps keine ganze Zahl", { reps: 2.5 }],
    ["weight über 9999", { weight: 10000 }],
    ["rpe über 10", { rpe: 11 }],
    ["rpe unter 1", { rpe: 0 }],
    ["isCompleted kein Boolean", { isCompleted: "yes" }],
  ])("Zod-Validierung: %s -> 400, kein Update", async (_name, body) => {
    const res = await PATCH(patchReq(body), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.any(String) });
    expect(prisma.set.update).not.toHaveBeenCalled();
  });

  it("Erfolg ohne Abschluss: update mit den Feldern, kein Timer-Reset, kein Rekord, PR-Abgleich löscht nur per setId", async () => {
    const res = await PATCH(patchReq({ reps: 8, weight: 60 }), ctx);
    expect(res.status).toBe(200);
    expect(prisma.set.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { reps: 8, weight: 60 },
    });
    expect(prisma.workout.update).not.toHaveBeenCalled();
    expect(prisma.personalRecord.deleteMany).toHaveBeenCalledWith({ where: { setId: "s1" } });
    expect(prisma.personalRecord.create).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.personalRecord).toBe(false);
    expect(json.data).toMatchObject({ id: "s1", reps: 8, weight: 60 });
  });

  it("Abschluss: completedAt gesetzt, Timer-Anpassung zurückgesetzt, Rekord mit userId/exerciseId/setId angelegt", async () => {
    const res = await PATCH(patchReq({ isCompleted: true, weight: 100, reps: 5 }), ctx);
    expect(res.status).toBe(200);
    const data = prisma.set.update.mock.calls[0]![0].data;
    expect(data).toMatchObject({ isCompleted: true, weight: 100, reps: 5 });
    expect(data.completedAt).toBeInstanceOf(Date);
    expect(prisma.workout.update).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { restTimerAdjustSeconds: 0 },
    });
    expect(prisma.personalRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u1",
        exerciseId: "e1",
        setId: "s1",
        weight: 100,
        reps: 5,
      }),
    });
    expect((await res.json()).personalRecord).toBe(true);
  });

  it("Abschluss eines bereits abgeschlossenen Satzes: kein Timer-Reset", async () => {
    prisma.set.findFirst.mockResolvedValue(existingSet({ isCompleted: true }));
    await PATCH(patchReq({ isCompleted: true, weight: 100, reps: 5 }), ctx);
    expect(prisma.workout.update).not.toHaveBeenCalled();
  });

  it("Wiedereröffnen (isCompleted=false): completedAt = null, kein Rekord", async () => {
    prisma.set.update.mockResolvedValue({
      id: "s1",
      isCompleted: false,
      isWarmup: false,
      weight: 100,
      reps: 5,
    });
    const res = await PATCH(patchReq({ isCompleted: false }), ctx);
    expect(prisma.set.update.mock.calls[0]![0].data).toEqual({
      isCompleted: false,
      completedAt: null,
    });
    expect(prisma.personalRecord.create).not.toHaveBeenCalled();
    expect((await res.json()).personalRecord).toBe(false);
  });

  it("Aufwärmsatz und Satz ohne Gewicht/Wiederholungen erzeugen keinen Rekord", async () => {
    await PATCH(patchReq({ isCompleted: true, isWarmup: true, weight: 40, reps: 10 }), ctx);
    await PATCH(patchReq({ isCompleted: true, weight: 0, reps: 10 }), ctx);
    expect(prisma.personalRecord.create).not.toHaveBeenCalled();
  });

  it("kein neuer Rekord, wenn ein besserer 1RM existiert", async () => {
    prisma.personalRecord.findFirst.mockResolvedValue({ estimated1RM: 500 });
    const res = await PATCH(patchReq({ isCompleted: true, weight: 100, reps: 5 }), ctx);
    expect(prisma.personalRecord.create).not.toHaveBeenCalled();
    expect((await res.json()).personalRecord).toBe(false);
  });

  it("FT-ERR-02: Satz-Update, Timer-Reset und PR-Abgleich laufen in genau einer $transaction (Client tx)", async () => {
    const res = await PATCH(patchReq({ isCompleted: true, weight: 100, reps: 5 }), ctx);
    expect(res.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(typeof prisma.$transaction.mock.calls[0]![0]).toBe("function");
    const [txStart] = prisma.$transaction.mock.invocationCallOrder;
    for (const m of [
      prisma.set.update,
      prisma.workout.update,
      prisma.personalRecord.deleteMany,
      prisma.personalRecord.create,
    ]) {
      expect(m.mock.invocationCallOrder[0]).toBeGreaterThan(txStart!);
    }
  });

  it("FT-ERR-02: Fehler im PR-Abgleich -> Fehler nach oben (500) und die Transaktion wird nicht committet (Rollback)", async () => {
    // Rollback simulieren: Schreibzugriffe nur wirksam, wenn der Callback ohne Fehler endet.
    const committed: string[] = [];
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const pending: string[] = [];
      const track = (name: string, fn: ReturnType<typeof vi.fn>) =>
        fn.mockImplementation(async () => {
          pending.push(name);
          return name === "set.update"
            ? { id: "s1", isCompleted: true, isWarmup: false, weight: 100, reps: 5 }
            : {};
        });
      track("set.update", prisma.set.update);
      track("pr.deleteMany", prisma.personalRecord.deleteMany);
      const result = await cb(prisma); // wirft -> pending verworfen
      committed.push(...pending);
      return result;
    });
    prisma.personalRecord.findFirst.mockRejectedValue(new Error("connection lost"));
    await expect(PATCH(patchReq({ isCompleted: true, weight: 100, reps: 5 }), ctx)).rejects.toThrow(
      "connection lost"
    );
    expect(committed).toEqual([]); // weder Satz noch gelöschter Rekord wurden übernommen
    expect(prisma.personalRecord.create).not.toHaveBeenCalled();
  });

  it("FT-ERR-02: wirft der Timer-Reset, wird nichts übernommen und der PR-Abgleich läuft nicht", async () => {
    prisma.workout.update.mockRejectedValue(new Error("timeout"));
    await expect(PATCH(patchReq({ isCompleted: true, weight: 100, reps: 5 }), ctx)).rejects.toThrow(
      "timeout"
    );
    expect(prisma.personalRecord.deleteMany).not.toHaveBeenCalled();
    expect(prisma.personalRecord.create).not.toHaveBeenCalled();
  });

  it("FT-ERR-02: bei Fehler wird die Neubewertung nie ohne vorheriges Löschen übersprungen (Löschen und Anlegen im selben tx)", async () => {
    await PATCH(patchReq({ isCompleted: true, weight: 100, reps: 5 }), ctx);
    expect(prisma.personalRecord.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.personalRecord.create.mock.invocationCallOrder[0]!
    );
  });
});

describe("DELETE /api/workouts/[id]/sets/[setId]", () => {
  it("ohne Session/Token: 401 und kein DB-Zugriff", async () => {
    resolveUserId.mockResolvedValue(null);
    const res = await DELETE(delReq(), ctx);
    expect(res.status).toBe(401);
    expect(prisma.set.delete).not.toHaveBeenCalled();
    expect(prisma.personalRecord.deleteMany).not.toHaveBeenCalled();
  });

  it("fremder/unbekannter Satz: 404, nichts gelöscht", async () => {
    prisma.set.findFirst.mockResolvedValue(null);
    const res = await DELETE(delReq(), ctx);
    expect(res.status).toBe(404);
    expect(prisma.set.findFirst).toHaveBeenCalledWith({ where: OWNED_WHERE });
    expect(prisma.set.delete).not.toHaveBeenCalled();
    expect(prisma.personalRecord.deleteMany).not.toHaveBeenCalled();
  });

  it("Erfolg: Rekorde des Satzes zuerst gelöscht, dann der Satz", async () => {
    prisma.set.delete.mockResolvedValue({});
    const res = await DELETE(delReq(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(prisma.personalRecord.deleteMany).toHaveBeenCalledWith({ where: { setId: "s1" } });
    expect(prisma.set.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
    expect(prisma.personalRecord.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.set.delete.mock.invocationCallOrder[0]!
    );
  });

  it("FT-ERR-02: Rekord-Löschung und Satz-Löschung laufen in einer $transaction (Array-Form, atomar)", async () => {
    prisma.set.delete.mockResolvedValue({});
    await DELETE(delReq(), ctx);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(Array.isArray(prisma.$transaction.mock.calls[0]![0])).toBe(true);
    expect(prisma.$transaction.mock.calls[0]![0]).toHaveLength(2);
  });

  it("FT-ERR-02: scheitert set.delete, wird der Fehler nach oben gereicht (Transaktion rollt Rekord-Löschung zurück)", async () => {
    prisma.set.delete.mockRejectedValue(new Error("db down"));
    await expect(DELETE(delReq(), ctx)).rejects.toThrow("db down");
  });
});
