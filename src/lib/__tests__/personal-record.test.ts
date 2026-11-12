import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  personalRecord: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma }));

const { recordPersonalRecordIfBest, removePersonalRecordForSet } =
  await import("@/lib/personal-record");

const base = { userId: "u1", exerciseId: "e1", setId: "s1" };

beforeEach(() => {
  vi.resetAllMocks();
  prisma.personalRecord.findUnique.mockResolvedValue(null);
  prisma.personalRecord.findFirst.mockResolvedValue(null);
  prisma.personalRecord.create.mockResolvedValue({});
});

describe("recordPersonalRecordIfBest", () => {
  it("ignoriert Gewicht <= 0 und Reps <= 0 ohne DB-Zugriff", async () => {
    await expect(recordPersonalRecordIfBest({ ...base, weight: 0, reps: 5 })).resolves.toEqual({
      recorded: false,
    });
    await expect(recordPersonalRecordIfBest({ ...base, weight: 100, reps: 0 })).resolves.toEqual({
      recorded: false,
    });
    expect(prisma.personalRecord.findUnique).not.toHaveBeenCalled();
  });

  it("legt den ersten Rekord an (e1RM nach Epley)", async () => {
    await expect(recordPersonalRecordIfBest({ ...base, weight: 100, reps: 10 })).resolves.toEqual({
      recorded: true,
    });
    const data = prisma.personalRecord.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      userId: "u1",
      exerciseId: "e1",
      setId: "s1",
      weight: 100,
      reps: 10,
    });
    expect(data.estimated1RM).toBeCloseTo(133.333, 2);
  });

  it("legt nichts an, wenn für den Satz schon ein Rekord existiert", async () => {
    prisma.personalRecord.findUnique.mockResolvedValue({ id: "pr" });
    await expect(recordPersonalRecordIfBest({ ...base, weight: 200, reps: 5 })).resolves.toEqual({
      recorded: false,
    });
    expect(prisma.personalRecord.create).not.toHaveBeenCalled();
  });

  it("verlangt einen echten Zuwachs: gleicher e1RM zählt nicht, höherer schon", async () => {
    prisma.personalRecord.findFirst.mockResolvedValue({ estimated1RM: 130 });
    await expect(recordPersonalRecordIfBest({ ...base, weight: 100, reps: 9 })).resolves.toEqual({
      recorded: false,
    }); // 130
    await expect(recordPersonalRecordIfBest({ ...base, weight: 100, reps: 10 })).resolves.toEqual({
      recorded: true,
    }); // 133.3
  });

  it("IST: bestehender Rekord mit estimated1RM 0/null wird überschrieben (bestVal <= 0 zählt als 'kein Rekord')", async () => {
    prisma.personalRecord.findFirst.mockResolvedValue({ estimated1RM: 0 });
    await expect(recordPersonalRecordIfBest({ ...base, weight: 20, reps: 1 })).resolves.toEqual({
      recorded: true,
    });
  });

  it("sucht den Bestwert pro Nutzer und Übung, absteigend nach e1RM", async () => {
    await recordPersonalRecordIfBest({ ...base, weight: 50, reps: 5 });
    expect(prisma.personalRecord.findFirst).toHaveBeenCalledWith({
      where: { userId: "u1", exerciseId: "e1" },
      orderBy: { estimated1RM: "desc" },
    });
  });

  it("IST: findUnique + findFirst + create sind nicht atomar (parallele Sätze können beide 'Rekord' werden)", async () => {
    // Beide Aufrufe sehen den gleichen Altstand und legen an; keine Transaktion/Sperre im Code.
    const [a, b] = await Promise.all([
      recordPersonalRecordIfBest({ ...base, setId: "s1", weight: 100, reps: 5 }),
      recordPersonalRecordIfBest({ ...base, setId: "s2", weight: 100, reps: 5 }),
    ]);
    expect([a.recorded, b.recorded]).toEqual([true, true]);
    expect(prisma.personalRecord.create).toHaveBeenCalledTimes(2);
  });
});

describe("removePersonalRecordForSet", () => {
  it("löscht per setId", async () => {
    await removePersonalRecordForSet("s9");
    expect(prisma.personalRecord.deleteMany).toHaveBeenCalledWith({ where: { setId: "s9" } });
  });
});
