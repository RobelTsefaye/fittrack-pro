import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { hashApiTokenSecret } from "@/lib/api-token-crypto";

/** Verhaltenstests /api/tokens und /api/tokens/[id] (FT-TEST-01), gemocktes Prisma/Auth. */

const prisma = vi.hoisted(() => ({
  apiToken: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma }));

const resolveUserId = vi.hoisted(() => vi.fn<() => Promise<string | null>>());
vi.mock("@/lib/api-auth", () => ({ resolveUserIdForDataApi: () => resolveUserId() }));

const list = await import("@/app/api/tokens/route");
const item = await import("@/app/api/tokens/[id]/route");

const post = (body?: unknown) =>
  new Request("http://x/api/tokens", {
    method: "POST",
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
const ctx = { params: Promise.resolve({ id: "t1" }) };

beforeEach(() => {
  vi.resetAllMocks();
  resolveUserId.mockResolvedValue("u1");
  prisma.apiToken.create.mockImplementation(async (a: { data: { name: string | null } }) => ({
    id: "t1",
    name: a.data.name,
    tokenPrefix: "ftp_xxxxxxxxxx…",
    createdAt: new Date("2026-03-10T00:00:00Z"),
  }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/tokens", () => {
  it("ohne Session: 401", async () => {
    resolveUserId.mockResolvedValue(null);
    expect((await list.GET()).status).toBe(401);
    expect(prisma.apiToken.findMany).not.toHaveBeenCalled();
  });

  it("listet nur Tokens des Nutzers und wählt nie tokenHash aus", async () => {
    prisma.apiToken.findMany.mockResolvedValue([]);
    const res = await list.GET();
    expect(res.status).toBe(200);
    const arg = prisma.apiToken.findMany.mock.calls[0]![0];
    expect(arg.where).toEqual({ userId: "u1" });
    expect(arg.select).not.toHaveProperty("tokenHash");
    expect(arg.select).toEqual({
      id: true,
      name: true,
      tokenPrefix: true,
      createdAt: true,
      lastUsedAt: true,
    });
  });

  it("Datenbankfehler: 500 mit Hinweistext (Ist: detail enthält die Fehlermeldung)", async () => {
    prisma.apiToken.findMany.mockRejectedValue(new Error("relation api_tokens does not exist"));
    const res = await list.GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to list API tokens");
    expect(json.detail).toContain("api_tokens");
    expect(json.hint).toContain("migrate");
  });
});

describe("POST /api/tokens", () => {
  it("ohne Session: 401, nichts angelegt", async () => {
    resolveUserId.mockResolvedValue(null);
    expect((await list.POST(post({ name: "x" }))).status).toBe(401);
    expect(prisma.apiToken.create).not.toHaveBeenCalled();
  });

  it("Name über 80 Zeichen: 400", async () => {
    expect((await list.POST(post({ name: "x".repeat(81) }))).status).toBe(400);
    expect(prisma.apiToken.create).not.toHaveBeenCalled();
  });

  it("Name kein String: 400", async () => {
    expect((await list.POST(post({ name: 5 }))).status).toBe(400);
  });

  it("Erfolg: speichert nur den SHA-256-Hash, liefert das Klartext-Token genau einmal", async () => {
    const res = await list.POST(post({ name: "  Claude  " }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.token).toMatch(/^ftp_/);
    expect(json.data.warning).toMatch(/not be shown again/);
    const data = prisma.apiToken.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ userId: "u1", name: "Claude" });
    expect(data.tokenHash).toBe(hashApiTokenSecret(json.data.token));
    expect(JSON.stringify(data)).not.toContain(json.data.token);
    expect(json.data).not.toHaveProperty("tokenHash");
  });

  it("ohne Body oder ungültiges JSON: Ist-Verhalten ist Anlage mit Name null (kein 400)", async () => {
    expect((await list.POST(post())).status).toBe(200);
    expect((await list.POST(post("{nope"))).status).toBe(200);
    expect(prisma.apiToken.create.mock.calls[0]![0].data.name).toBeNull();
    expect(prisma.apiToken.create.mock.calls[1]![0].data.name).toBeNull();
  });

  it("leerer Name nach Trim wird zu null", async () => {
    await list.POST(post({ name: "   " }));
    expect(prisma.apiToken.create.mock.calls[0]![0].data.name).toBeNull();
  });

  it("Datenbankfehler: 500 mit Hinweis, kein Token in der Antwort", async () => {
    prisma.apiToken.create.mockRejectedValue(new Error("boom"));
    const res = await list.POST(post({}));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to create API token");
    expect(json).not.toHaveProperty("data");
  });
});

describe("DELETE /api/tokens/[id]", () => {
  const del = () => new Request("http://x/api/tokens/t1", { method: "DELETE" });

  it("ohne Session: 401", async () => {
    resolveUserId.mockResolvedValue(null);
    expect((await item.DELETE(del(), ctx)).status).toBe(401);
    expect(prisma.apiToken.delete).not.toHaveBeenCalled();
  });

  it("fremdes/unbekanntes Token: 404 mit userId-Filter, nichts gelöscht", async () => {
    prisma.apiToken.findFirst.mockResolvedValue(null);
    expect((await item.DELETE(del(), ctx)).status).toBe(404);
    expect(prisma.apiToken.findFirst).toHaveBeenCalledWith({
      where: { id: "t1", userId: "u1" },
      select: { id: true },
    });
    expect(prisma.apiToken.delete).not.toHaveBeenCalled();
  });

  it("Erfolg: delete per id", async () => {
    prisma.apiToken.findFirst.mockResolvedValue({ id: "t1" });
    prisma.apiToken.delete.mockResolvedValue({});
    const res = await item.DELETE(del(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(prisma.apiToken.delete).toHaveBeenCalledWith({ where: { id: "t1" } });
  });
});
