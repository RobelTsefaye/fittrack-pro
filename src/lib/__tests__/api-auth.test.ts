import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization von `resolveUserIdForDataApi` / `resolveUserIdBySecret`:
 * Session-Cookie zuerst, sonst `Authorization: Bearer <token>`.
 */

const auth = vi.hoisted(() => vi.fn());
const headersFn = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({ apiToken: { findUnique: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("next/headers", () => ({ headers: headersFn }));
vi.mock("@/lib/prisma", () => ({ prisma }));

const { resolveUserIdBySecret, resolveUserIdForDataApi } = await import("@/lib/api-auth");
const { hashApiTokenSecret } = await import("@/lib/api-token-crypto");

const withAuthz = (value: string | null) =>
  headersFn.mockResolvedValue(new Headers(value === null ? {} : { authorization: value }));

beforeEach(() => {
  vi.resetAllMocks();
  auth.mockResolvedValue(null);
  withAuthz(null);
  prisma.apiToken.update.mockResolvedValue({});
});

describe("resolveUserIdForDataApi", () => {
  it("Session hat Vorrang; Header und DB werden dann nicht gelesen", async () => {
    auth.mockResolvedValue({ user: { id: "sess-user" } });
    await expect(resolveUserIdForDataApi()).resolves.toBe("sess-user");
    expect(headersFn).not.toHaveBeenCalled();
    expect(prisma.apiToken.findUnique).not.toHaveBeenCalled();
  });

  it("ohne Session und ohne Authorization-Header: null", async () => {
    await expect(resolveUserIdForDataApi()).resolves.toBeNull();
  });

  it("anderes Schema als 'Bearer ' (z. B. Basic, kleingeschrieben 'bearer'): null", async () => {
    withAuthz("Basic abc");
    await expect(resolveUserIdForDataApi()).resolves.toBeNull();
    withAuthz("bearer ftp_x"); // IST: Schema ist case-sensitiv
    await expect(resolveUserIdForDataApi()).resolves.toBeNull();
    expect(prisma.apiToken.findUnique).not.toHaveBeenCalled();
  });

  it("Bearer-Token: schlägt per Hash nach, trimmt und gibt userId zurück; lastUsedAt wird aktualisiert", async () => {
    withAuthz("Bearer  ftp_secret  ");
    prisma.apiToken.findUnique.mockResolvedValue({ id: "t1", userId: "tok-user" });
    await expect(resolveUserIdForDataApi()).resolves.toBe("tok-user");
    expect(prisma.apiToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashApiTokenSecret("ftp_secret") },
      select: { id: true, userId: true },
    });
    expect(prisma.apiToken.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it("unbekannter Token: null, kein Update", async () => {
    withAuthz("Bearer ftp_nope");
    prisma.apiToken.findUnique.mockResolvedValue(null);
    await expect(resolveUserIdForDataApi()).resolves.toBeNull();
    expect(prisma.apiToken.update).not.toHaveBeenCalled();
  });

  it("leerer Token nach 'Bearer ': null ohne DB-Zugriff", async () => {
    withAuthz("Bearer    ");
    await expect(resolveUserIdForDataApi()).resolves.toBeNull();
    expect(prisma.apiToken.findUnique).not.toHaveBeenCalled();
  });

  it("IST: Fehler beim lastUsedAt-Update werden verschluckt und blockieren die Auth nicht", async () => {
    prisma.apiToken.findUnique.mockResolvedValue({ id: "t1", userId: "u" });
    prisma.apiToken.update.mockRejectedValue(new Error("db down"));
    await expect(resolveUserIdBySecret("ftp_x")).resolves.toBe("u");
  });

  it("IST: Token-Modell hat kein Ablaufdatum (api_tokens); nur Existenz der Hash-Zeile zählt", async () => {
    prisma.apiToken.findUnique.mockResolvedValue({ id: "t", userId: "u" });
    await expect(resolveUserIdBySecret("ftp_old")).resolves.toBe("u");
  });
});

describe("resolveUserIdBySecret", () => {
  it("leeres Secret: null ohne DB-Zugriff", async () => {
    await expect(resolveUserIdBySecret("")).resolves.toBeNull();
    expect(prisma.apiToken.findUnique).not.toHaveBeenCalled();
  });
});
