import { beforeEach, describe, expect, it, vi } from "vitest";

/** Verhaltenstests GET /api/export (FT-TEST-01), gemocktes Prisma/Auth. */

const prisma = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma }));

const resolveUserId = vi.hoisted(() => vi.fn<() => Promise<string | null>>());
vi.mock("@/lib/api-auth", () => ({ resolveUserIdForDataApi: () => resolveUserId() }));

const { GET } = await import("@/app/api/export/route");

beforeEach(() => {
  vi.resetAllMocks();
  resolveUserId.mockResolvedValue("u1");
});

describe("GET /api/export", () => {
  it("ohne Session/Token: 401 und kein DB-Zugriff", async () => {
    resolveUserId.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("liest ausschließlich den eigenen Nutzer (where.id = userId)", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1", workouts: [] });
    await GET();
    expect(prisma.user.findUnique.mock.calls[0]![0].where).toEqual({ id: "u1" });
  });

  it("select enthält keine Zugangsdaten (kein Passwort-Hash, keine Tokens, keine Konten)", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1" });
    await GET();
    const select = prisma.user.findUnique.mock.calls[0]![0].select as Record<string, unknown>;
    for (const forbidden of ["password", "passwordHash", "apiTokens", "accounts", "sessions"]) {
      expect(select).not.toHaveProperty(forbidden);
    }
    expect(select).toMatchObject({
      id: true,
      email: true,
      bodyWeights: expect.anything(),
      workouts: expect.anything(),
      personalRecords: expect.anything(),
    });
  });

  it("Erfolg: data = Nutzer, meta mit exportedAt (ISO) und format json", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.c" });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({ id: "u1", email: "a@b.c" });
    expect(json.meta.format).toBe("json");
    expect(new Date(json.meta.exportedAt).toISOString()).toBe(json.meta.exportedAt);
  });

  it("Nutzer nicht gefunden: 404", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    expect((await GET()).status).toBe(404);
  });

  it("Prisma-Fehler wird nach oben gereicht (500)", async () => {
    prisma.user.findUnique.mockRejectedValue(new Error("db down"));
    await expect(GET()).rejects.toThrow("db down");
  });
});
