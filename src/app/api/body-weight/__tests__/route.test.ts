import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** Verhaltenstests /api/body-weight und /api/body-weight/[id] (FT-TEST-01), gemocktes Prisma/Auth. */

const prisma = vi.hoisted(() => ({
  bodyWeight: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma }));

const resolveUserId = vi.hoisted(() => vi.fn<() => Promise<string | null>>());
vi.mock("@/lib/api-auth", () => ({ resolveUserIdForDataApi: () => resolveUserId() }));

const revalidateTag = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidateTag }));

const list = await import("@/app/api/body-weight/route");
const item = await import("@/app/api/body-weight/[id]/route");

const mkReq = (method: string, body?: unknown, url = "http://x/api/body-weight") =>
  new NextRequest(url, {
    method,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ id: "b1" }) };

const row = (over: object = {}) => ({
  id: "b1",
  weight: 80.5,
  date: new Date("2026-03-10T00:00:00.000Z"),
  notes: null,
  createdAt: new Date("2026-03-10T07:00:00.000Z"),
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  resolveUserId.mockResolvedValue("u1");
  prisma.bodyWeight.upsert.mockResolvedValue(row());
  prisma.bodyWeight.update.mockResolvedValue(row({ weight: 81 }));
  prisma.bodyWeight.findFirst.mockResolvedValue(row());
  prisma.bodyWeight.findMany.mockResolvedValue([row()]);
});

describe("GET /api/body-weight", () => {
  it("ohne Session: 401", async () => {
    resolveUserId.mockResolvedValue(null);
    expect((await list.GET(mkReq("GET"))).status).toBe(401);
    expect(prisma.bodyWeight.findMany).not.toHaveBeenCalled();
  });

  it("ungültiges Datum in from: 400 (InvalidDateError), kein Query", async () => {
    const res = await list.GET(mkReq("GET", undefined, "http://x/api/body-weight?from=2026-02-30"));
    expect(res.status).toBe(400);
    expect(prisma.bodyWeight.findMany).not.toHaveBeenCalled();
  });

  it("Filter userId (+ Datumsbereich), Antwort mit ISO-Datum", async () => {
    const res = await list.GET(
      mkReq("GET", undefined, "http://x/api/body-weight?from=2026-03-01&to=2026-03-31")
    );
    expect(prisma.bodyWeight.findMany).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        date: {
          gte: new Date("2026-03-01T00:00:00.000Z"),
          lte: new Date("2026-03-31T00:00:00.000Z"),
        },
      },
      orderBy: { date: "desc" },
    });
    expect((await res.json()).data).toEqual([
      {
        id: "b1",
        weight: 80.5,
        date: "2026-03-10",
        notes: null,
        createdAt: "2026-03-10T07:00:00.000Z",
      },
    ]);
  });
});

describe("POST /api/body-weight", () => {
  it("ohne Session: 401, kein Schreibzugriff", async () => {
    resolveUserId.mockResolvedValue(null);
    expect((await list.POST(mkReq("POST", { weight: 80, date: "2026-03-10" }))).status).toBe(401);
    expect(prisma.bodyWeight.upsert).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("ungültiges JSON: 400", async () => {
    expect((await list.POST(mkReq("POST", "{nope"))).status).toBe(400);
  });

  it.each([
    ["Gewicht 0", { weight: 0, date: "2026-03-10" }],
    ["Gewicht negativ", { weight: -5, date: "2026-03-10" }],
    ["Gewicht über 999", { weight: 1000, date: "2026-03-10" }],
    ["Datum fehlt", { weight: 80 }],
    ["Datum falsches Format", { weight: 80, date: "10.03.2026" }],
    ["Datum kalendarisch ungültig", { weight: 80, date: "2026-02-30" }],
    ["Notiz zu lang", { weight: 80, date: "2026-03-10", notes: "x".repeat(501) }],
  ])("Zod-Validierung: %s -> 400, kein Upsert", async (_n, body) => {
    const res = await list.POST(mkReq("POST", body));
    expect(res.status).toBe(400);
    expect(prisma.bodyWeight.upsert).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("Erfolg: Upsert je (userId, Datum), Notiz getrimmt, Dashboard-Cache invalidiert", async () => {
    const res = await list.POST(
      mkReq("POST", { weight: 80.5, date: "2026-03-10", notes: "  morgens  " })
    );
    expect(res.status).toBe(200);
    const date = new Date("2026-03-10T00:00:00.000Z");
    expect(prisma.bodyWeight.upsert).toHaveBeenCalledWith({
      where: { userId_date: { userId: "u1", date } },
      create: { userId: "u1", date, weight: 80.5, notes: "morgens" },
      update: { weight: 80.5, notes: "morgens" },
    });
    expect(revalidateTag).toHaveBeenCalledWith("dashboard-user-u1", "max");
    expect((await res.json()).data).toMatchObject({ id: "b1", date: "2026-03-10" });
  });

  it("leere/Whitespace-Notiz wird zu null", async () => {
    await list.POST(mkReq("POST", { weight: 80, date: "2026-03-10", notes: "   " }));
    expect(prisma.bodyWeight.upsert.mock.calls[0]![0].create.notes).toBeNull();
    await list.POST(mkReq("POST", { weight: 80, date: "2026-03-10", notes: "" }));
    expect(prisma.bodyWeight.upsert.mock.calls[1]![0].update.notes).toBeNull();
  });

  it("Prisma-Fehler: wird nach oben gereicht (500), Cache nicht invalidiert", async () => {
    prisma.bodyWeight.upsert.mockRejectedValue(new Error("db down"));
    await expect(list.POST(mkReq("POST", { weight: 80, date: "2026-03-10" }))).rejects.toThrow(
      "db down"
    );
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

describe("PATCH/DELETE /api/body-weight/[id]", () => {
  it("ohne Session: 401", async () => {
    resolveUserId.mockResolvedValue(null);
    expect((await item.PATCH(mkReq("PATCH", { weight: 81 }), ctx)).status).toBe(401);
    expect((await item.DELETE(mkReq("DELETE"), ctx)).status).toBe(401);
    expect(prisma.bodyWeight.findFirst).not.toHaveBeenCalled();
  });

  it("fremder/unbekannter Eintrag: 404 mit userId-Filter, nichts geschrieben", async () => {
    prisma.bodyWeight.findFirst.mockResolvedValue(null);
    expect((await item.PATCH(mkReq("PATCH", { weight: 81 }), ctx)).status).toBe(404);
    expect((await item.DELETE(mkReq("DELETE"), ctx)).status).toBe(404);
    expect(prisma.bodyWeight.findFirst).toHaveBeenCalledWith({ where: { id: "b1", userId: "u1" } });
    expect(prisma.bodyWeight.update).not.toHaveBeenCalled();
    expect(prisma.bodyWeight.delete).not.toHaveBeenCalled();
  });

  it("PATCH ungültig: 400 (Gewicht 0, ungültiges JSON)", async () => {
    expect((await item.PATCH(mkReq("PATCH", { weight: 0 }), ctx)).status).toBe(400);
    expect((await item.PATCH(mkReq("PATCH", "{nope"), ctx)).status).toBe(400);
    expect(prisma.bodyWeight.update).not.toHaveBeenCalled();
  });

  it("PATCH Erfolg: update per id, notes=null löscht die Notiz, Cache invalidiert", async () => {
    const res = await item.PATCH(mkReq("PATCH", { weight: 81, notes: null }), ctx);
    expect(res.status).toBe(200);
    expect(prisma.bodyWeight.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { weight: 81, notes: null },
    });
    expect(revalidateTag).toHaveBeenCalledWith("dashboard-user-u1", "max");
    expect((await res.json()).data.weight).toBe(81);
  });

  it("PATCH ohne notes lässt die Notiz unberührt (undefined)", async () => {
    await item.PATCH(mkReq("PATCH", { weight: 81 }), ctx);
    expect(prisma.bodyWeight.update.mock.calls[0]![0].data.notes).toBeUndefined();
  });

  it("DELETE Erfolg: delete per id, Cache invalidiert", async () => {
    prisma.bodyWeight.delete.mockResolvedValue({});
    const res = await item.DELETE(mkReq("DELETE"), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(prisma.bodyWeight.delete).toHaveBeenCalledWith({ where: { id: "b1" } });
    expect(revalidateTag).toHaveBeenCalledWith("dashboard-user-u1", "max");
  });
});
