import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/** Verhaltenstests /api/plans und /api/plans/[planId] (FT-TEST-01), gemocktes Prisma/Auth. */

const prisma = vi.hoisted(() => ({
  workoutPlan: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma }));

const resolveUserId = vi.hoisted(() => vi.fn<() => Promise<string | null>>());
vi.mock("@/lib/api-auth", () => ({ resolveUserIdForDataApi: () => resolveUserId() }));

const list = await import("@/app/api/plans/route");
const item = await import("@/app/api/plans/[planId]/route");

const mkReq = (method: string, body?: unknown) =>
  new Request("http://x/api/plans", {
    method,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
const ctx = { params: Promise.resolve({ planId: "p1" }) };

beforeEach(() => {
  vi.resetAllMocks();
  resolveUserId.mockResolvedValue("u1");
  prisma.workoutPlan.findFirst.mockResolvedValue({ id: "p1", sessions: [] });
  prisma.workoutPlan.create.mockImplementation(async (a: { data: object }) => ({
    id: "p1",
    ...a.data,
  }));
  prisma.workoutPlan.update.mockImplementation(async (a: { data: object }) => ({
    id: "p1",
    ...a.data,
  }));
});

describe("/api/plans", () => {
  it("GET ohne Session: 401", async () => {
    resolveUserId.mockResolvedValue(null);
    expect((await list.GET()).status).toBe(401);
    expect(prisma.workoutPlan.findMany).not.toHaveBeenCalled();
  });

  it("GET: nur Pläne des Nutzers, neueste zuerst", async () => {
    prisma.workoutPlan.findMany.mockResolvedValue([{ id: "p1" }]);
    const res = await list.GET();
    expect(res.status).toBe(200);
    expect(prisma.workoutPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" }, orderBy: { updatedAt: "desc" } })
    );
    expect((await res.json()).data).toEqual([{ id: "p1" }]);
  });

  it("POST ohne Session: 401, nichts angelegt", async () => {
    resolveUserId.mockResolvedValue(null);
    expect((await list.POST(mkReq("POST", { name: "PPL" }))).status).toBe(401);
    expect(prisma.workoutPlan.create).not.toHaveBeenCalled();
  });

  it.each([
    ["leerer Name", { name: "" }],
    ["Name fehlt", {}],
    ["Name über 120", { name: "x".repeat(121) }],
    ["Beschreibung über 500", { name: "PPL", description: "x".repeat(501) }],
  ])("POST Zod-Validierung: %s -> 400", async (_n, body) => {
    expect((await list.POST(mkReq("POST", body))).status).toBe(400);
    expect(prisma.workoutPlan.create).not.toHaveBeenCalled();
  });

  it("POST ungültiges JSON: 400", async () => {
    expect((await list.POST(mkReq("POST", "{nope"))).status).toBe(400);
  });

  it("POST Erfolg: 201, userId gesetzt, fehlende Beschreibung wird null", async () => {
    const res = await list.POST(mkReq("POST", { name: "PPL" }));
    expect(res.status).toBe(201);
    expect(prisma.workoutPlan.create).toHaveBeenCalledWith({
      data: { userId: "u1", name: "PPL", description: null },
    });
  });
});

describe("/api/plans/[planId]", () => {
  it("ohne Session: 401 für GET/PATCH/DELETE", async () => {
    resolveUserId.mockResolvedValue(null);
    expect((await item.GET(mkReq("GET"), ctx)).status).toBe(401);
    expect((await item.PATCH(mkReq("PATCH", { name: "x" }), ctx)).status).toBe(401);
    expect((await item.DELETE(mkReq("DELETE"), ctx)).status).toBe(401);
    expect(prisma.workoutPlan.findFirst).not.toHaveBeenCalled();
  });

  it("fremder/unbekannter Plan: 404 mit userId-Filter, nichts geschrieben", async () => {
    prisma.workoutPlan.findFirst.mockResolvedValue(null);
    expect((await item.GET(mkReq("GET"), ctx)).status).toBe(404);
    expect((await item.PATCH(mkReq("PATCH", { name: "x" }), ctx)).status).toBe(404);
    expect((await item.DELETE(mkReq("DELETE"), ctx)).status).toBe(404);
    for (const call of prisma.workoutPlan.findFirst.mock.calls) {
      expect(call[0].where).toEqual({ id: "p1", userId: "u1" });
    }
    expect(prisma.workoutPlan.update).not.toHaveBeenCalled();
    expect(prisma.workoutPlan.delete).not.toHaveBeenCalled();
  });

  it("PATCH ungültig: 400 (leerer Name, ungültiges JSON)", async () => {
    expect((await item.PATCH(mkReq("PATCH", { name: "" }), ctx)).status).toBe(400);
    expect((await item.PATCH(mkReq("PATCH", "{nope"), ctx)).status).toBe(400);
    expect(prisma.workoutPlan.update).not.toHaveBeenCalled();
  });

  it("PATCH Erfolg: nur gesendete Felder; description=null löscht, fehlend lässt unberührt", async () => {
    await item.PATCH(mkReq("PATCH", { name: "Neu" }), ctx);
    expect(prisma.workoutPlan.update).toHaveBeenLastCalledWith({
      where: { id: "p1" },
      data: { name: "Neu" },
    });
    await item.PATCH(mkReq("PATCH", { description: null }), ctx);
    expect(prisma.workoutPlan.update).toHaveBeenLastCalledWith({
      where: { id: "p1" },
      data: { description: null },
    });
  });

  it("DELETE Erfolg", async () => {
    prisma.workoutPlan.delete.mockResolvedValue({});
    const res = await item.DELETE(mkReq("DELETE"), ctx);
    expect(res.status).toBe(200);
    expect(prisma.workoutPlan.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });

  it("Prisma-Fehler beim Löschen wird nach oben gereicht (500)", async () => {
    prisma.workoutPlan.delete.mockRejectedValue(new Error("fk"));
    await expect(item.DELETE(mkReq("DELETE"), ctx)).rejects.toThrow("fk");
  });
});
