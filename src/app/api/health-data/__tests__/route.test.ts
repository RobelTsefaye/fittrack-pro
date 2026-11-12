import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Characterization von POST /api/health-data mit gemocktem Prisma.
 * Belegt das Überschreibverhalten (KB-I: Tageswerte werden bei jedem Sync überschrieben).
 */

const prisma = vi.hoisted(() => ({
  healthSnapshot: { upsert: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  appleWorkout: { upsert: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma }));

const resolveUserId = vi.hoisted(() => vi.fn<() => Promise<string | null>>());
vi.mock("@/lib/api-auth", () => ({ resolveUserIdForDataApi: () => resolveUserId() }));

const { POST, GET, DELETE } = await import("@/app/api/health-data/route");

const req = (body: unknown, url = "http://x/api/health-data") =>
  new Request(url, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;

const DAY = new Date("2026-03-10T00:00:00.000Z");

beforeEach(() => {
  vi.resetAllMocks();
  resolveUserId.mockResolvedValue("u1");
  prisma.healthSnapshot.upsert.mockImplementation(async (args: { create: object }) => ({
    id: "snap",
    ...args.create,
  }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("POST /api/health-data", () => {
  it("ohne Session/Token: 401 und kein DB-Zugriff", async () => {
    resolveUserId.mockResolvedValue(null);
    const res = await POST(req({ date: "2026-03-10", steps: 1 }));
    expect(res.status).toBe(401);
    expect(prisma.healthSnapshot.upsert).not.toHaveBeenCalled();
    expect(
      (await GET(new Request("http://x/api/health-data") as unknown as NextRequest)).status
    ).toBe(401);
    expect(
      (
        await DELETE(
          new Request("http://x/api/health-data?date=2026-03-10", {
            method: "DELETE",
          }) as unknown as NextRequest
        )
      ).status
    ).toBe(401);
  });

  it("ungültiges JSON: 400", async () => {
    const res = await POST(req("{nope"));
    expect(res.status).toBe(400);
  });

  it("upsert pro (userId, Datum); create enthält alle Felder, update dieselben Felder", async () => {
    await POST(req({ date: "2026-03-10", steps: 4000, activeCalories: 350 }));
    expect(prisma.healthSnapshot.upsert).toHaveBeenCalledWith({
      where: { userId_date: { userId: "u1", date: DAY } },
      create: { userId: "u1", date: DAY, steps: 4000, activeCalories: 350 },
      update: { steps: 4000, activeCalories: 350 },
    });
  });

  it("KB-I (IST): ein späterer Sync mit kleinerem Wert überschreibt den höheren Tageswert (last write wins)", async () => {
    await POST(req({ date: "2026-03-10", activeCalories: 600 }));
    await POST(req({ date: "2026-03-10", activeCalories: 120 }));
    const updates = prisma.healthSnapshot.upsert.mock.calls.map(([a]) => a.update.activeCalories);
    expect(updates).toEqual([600, 120]); // kein max()/Merge, keine Quelle/Zeitstempel-Prüfung
  });

  it("nicht gesendete Felder bleiben unberührt (kein Nullen), explizites null ebenfalls (wird übersprungen)", async () => {
    await POST(req({ date: "2026-03-10", steps: 100, hrv: null, protein: undefined }));
    const { update } = prisma.healthSnapshot.upsert.mock.calls[0][0];
    expect(update).toEqual({ steps: 100 });
  });

  it("IST (Finding-Kandidat): ungültiges Datum wird still verworfen, der Wert landet auf HEUTE (UTC)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T22:30:00.000Z"));
    try {
      await POST(req({ date: "2026-02-30", steps: 777 }));
    } finally {
      vi.useRealTimers();
    }
    const arg = prisma.healthSnapshot.upsert.mock.calls[0][0];
    expect(arg.where.userId_date.date.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(arg.update).toEqual({ steps: 777 });
  });

  it("IST: einzelne ungültige Felder werden still verworfen, gültige gespeichert", async () => {
    await POST(req({ date: "2026-03-10", steps: -5, restingHeartRate: 10, sleepQuality: 80 }));
    expect(prisma.healthSnapshot.upsert.mock.calls[0][0].update).toEqual({ sleepQuality: 80 });
  });

  it("ohne verwertbare Felder: kein upsert, count 0", async () => {
    const res = await POST(req({ date: "2026-03-10", steps: -1 }));
    expect(prisma.healthSnapshot.upsert).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ count: 0, workoutsImported: 0 });
  });

  it("Health Auto Export: Metriken pro Tag, Schritte werden pro Tag aufsummiert", async () => {
    await POST(
      req({
        data: {
          metrics: [
            {
              name: "step_count",
              units: "count",
              data: [
                { date: "2026-03-10 08:00:00 +0100", qty: 1000 },
                { date: "2026-03-10 18:00:00 +0100", qty: 2500 },
              ],
            },
          ],
        },
      })
    );
    const arg = prisma.healthSnapshot.upsert.mock.calls[0][0];
    expect(arg.update.steps).toBe(3500);
    expect(arg.where.userId_date.date.toISOString()).toBe("2026-03-10T00:00:00.000Z");
  });

  it("IST, vermutlich Bug: KB-I: nach gelöschtem Apple-Fitness-Training sendet der Client ein kleineres Tagesaggregat; der Server setzt die Kalorien zurück und lässt Workout-Zeilen unberührt", async () => {
    await POST(req({ date: "2026-03-10", activeCalories: 500, steps: 4000 }));
    await POST(req({ date: "2026-03-10", activeCalories: 200 }));
    const updates = prisma.healthSnapshot.upsert.mock.calls.map(([a]) => a.update);
    expect(updates).toEqual([{ activeCalories: 500, steps: 4000 }, { activeCalories: 200 }]);
    expect(prisma.appleWorkout.upsert).not.toHaveBeenCalled();
  });

  it.todo(
    "KB-I: Zielverhalten (Merge/Maximum/Quelle) ist Produktentscheidung von Robel, Schema-Änderung nötig"
  );
});

describe("DELETE /api/health-data", () => {
  it("verlangt date und löscht nur für den eigenen Nutzer", async () => {
    const bad = await DELETE(
      new Request("http://x/api/health-data", { method: "DELETE" }) as unknown as NextRequest
    );
    expect(bad.status).toBe(400);
    await DELETE(
      new Request("http://x/api/health-data?date=2026-03-10", {
        method: "DELETE",
      }) as unknown as NextRequest
    );
    expect(prisma.healthSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", date: DAY },
    });
  });

  it("ungültiges Datum: 400 über withApi", async () => {
    const res = await DELETE(
      new Request("http://x/api/health-data?date=2026-02-30", {
        method: "DELETE",
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(400);
  });
});
