import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  personalRecord: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma }));

const { recordPersonalRecordIfBest, recordPersonalRecordsInOrder, removePersonalRecordForSet } =
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

type Row = { setId: string; exerciseId: string; estimated1RM: number | null };
type SetIn = { exerciseId: string; setId: string; weight: number; reps: number };

/** In-Memory-Ersatz für personal_records (DESC-Sortierung: NULL zuerst wie in Postgres). */
function fakeDb(initial: Row[]) {
  const rows = [...initial];
  prisma.personalRecord.findUnique.mockImplementation(
    async ({ where }: { where: { setId: string } }) =>
      rows.find((r) => r.setId === where.setId) ?? null
  );
  prisma.personalRecord.findFirst.mockImplementation(
    async ({ where }: { where: { exerciseId: string } }) => {
      const mine = rows.filter((r) => r.exerciseId === where.exerciseId);
      const nul = mine.find((r) => r.estimated1RM == null);
      if (nul) return nul;
      return [...mine].sort((a, b) => b.estimated1RM! - a.estimated1RM!)[0] ?? null;
    }
  );
  prisma.personalRecord.create.mockImplementation(
    async ({ data }: { data: Row }) => void rows.push(data)
  );
  prisma.personalRecord.findMany.mockImplementation(
    async ({ where }: { where: { exerciseId: { in: string[] } } }) =>
      rows.filter((r) => where.exerciseId.in.includes(r.exerciseId))
  );
  prisma.personalRecord.createMany.mockImplementation(async ({ data }: { data: Row[] }) => {
    rows.push(...data);
  });
  return rows;
}

async function sequential(sets: SetIn[]) {
  const out: string[] = [];
  for (const s of sets) {
    const r = await recordPersonalRecordIfBest({ userId: "u1", ...s });
    if (r.recorded) out.push(s.setId);
  }
  return out;
}

const mk = (setId: string, weight: number, reps: number, exerciseId = "e1"): SetIn => ({
  exerciseId,
  setId,
  weight,
  reps,
});

const scenarios: { name: string; initial: Row[]; sets: SetIn[]; expected: string[] }[] = [
  {
    name: "Rampe: jeder höhere Satz ist ein Rekord",
    initial: [],
    sets: [mk("a", 60, 5), mk("b", 80, 5), mk("c", 100, 5)],
    expected: ["a", "b", "c"],
  },
  {
    name: "absteigende Reihenfolge: nur der erste zählt (späterer Satz tritt gegen neuen Bestwert an)",
    initial: [],
    sets: [mk("a", 100, 5), mk("b", 80, 5), mk("c", 60, 5)],
    expected: ["a"],
  },
  {
    name: "Gleichstand in der Sitzung ist kein Rekord",
    initial: [],
    sets: [mk("a", 100, 5), mk("b", 100, 5)],
    expected: ["a"],
  },
  {
    name: "Gleichstand mit vorhandenem Rekord ist kein Rekord",
    initial: [{ setId: "old", exerciseId: "e1", estimated1RM: 100 * (1 + 5 / 30) }],
    sets: [mk("a", 100, 5), mk("b", 100, 6)],
    expected: ["b"],
  },
  {
    name: "Satz mit vorhandenem Rekord wird übersprungen, zählt aber als Bestwert",
    initial: [{ setId: "a", exerciseId: "e1", estimated1RM: 200 }],
    sets: [mk("a", 100, 5), mk("b", 150, 5)],
    expected: [],
  },
  {
    name: "Übungen sind unabhängig, gleiche Übung in zwei Blöcken teilt den Bestwert",
    initial: [],
    sets: [mk("a", 100, 5, "e1"), mk("b", 50, 5, "e2"), mk("c", 90, 5, "e1"), mk("d", 60, 5, "e2")],
    expected: ["a", "b", "d"],
  },
  {
    name: "weight/reps <= 0 werden ignoriert",
    initial: [],
    sets: [mk("a", 0, 5), mk("b", 100, 0), mk("c", -5, 5), mk("d", 40, 8)],
    expected: ["d"],
  },
  {
    name: "IST: vorhandener Rekord mit e1RM NULL: jeder Satz zählt (Bestwert 0)",
    initial: [{ setId: "old", exerciseId: "e1", estimated1RM: null }],
    sets: [mk("a", 100, 5), mk("b", 80, 5)],
    expected: ["a", "b"],
  },
  {
    name: "fremder Rekord höher: nichts",
    initial: [{ setId: "old", exerciseId: "e1", estimated1RM: 500 }],
    sets: [mk("a", 100, 5)],
    expected: [],
  },
];

describe("recordPersonalRecordsInOrder (gebündelt) == Einzelvariante in Schleife", () => {
  for (const sc of scenarios) {
    it(sc.name, async () => {
      fakeDb(sc.initial);
      const seq = await sequential(sc.sets);
      expect(seq).toEqual(sc.expected);

      vi.clearAllMocks();
      const rows = fakeDb(sc.initial);
      const batch = await recordPersonalRecordsInOrder({ userId: "u1", sets: sc.sets });
      expect(batch.recordedSetIds).toEqual(sc.expected);
      expect(rows.length).toBe(sc.initial.length + sc.expected.length);
    });
  }

  it("legt Rekorddaten wie die Einzelvariante an (e1RM nach Epley)", async () => {
    fakeDb([]);
    await recordPersonalRecordsInOrder({ userId: "u1", sets: [mk("a", 100, 10)] });
    const data = prisma.personalRecord.createMany.mock.calls[0][0].data[0];
    expect(data).toMatchObject({
      userId: "u1",
      exerciseId: "e1",
      setId: "a",
      weight: 100,
      reps: 10,
    });
    expect(data.estimated1RM).toBeCloseTo(133.333, 2);
  });

  it("kein N+1: 30 Sätze = 1 findMany + 1 createMany, keine Einzelqueries", async () => {
    fakeDb([]);
    const sets = Array.from({ length: 30 }, (_, i) => mk(`s${i}`, 50 + i, 5, `e${i % 4}`));
    await recordPersonalRecordsInOrder({ userId: "u1", sets });
    expect(prisma.personalRecord.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.personalRecord.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.personalRecord.findUnique).not.toHaveBeenCalled();
    expect(prisma.personalRecord.findFirst).not.toHaveBeenCalled();
    expect(prisma.personalRecord.create).not.toHaveBeenCalled();
  });

  it("ohne gültige Sätze: kein DB-Zugriff", async () => {
    await recordPersonalRecordsInOrder({ userId: "u1", sets: [mk("a", 0, 5)] });
    expect(prisma.personalRecord.findMany).not.toHaveBeenCalled();
    expect(prisma.personalRecord.createMany).not.toHaveBeenCalled();
  });
});

describe("removePersonalRecordForSet", () => {
  it("löscht per setId", async () => {
    await removePersonalRecordForSet("s9");
    expect(prisma.personalRecord.deleteMany).toHaveBeenCalledWith({ where: { setId: "s9" } });
  });
});
