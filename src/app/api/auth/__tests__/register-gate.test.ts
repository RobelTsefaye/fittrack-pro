import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  apiToken: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
const compare = vi.hoisted(() => vi.fn());
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(async () => "hash"), compare },
}));

const { POST: register } = await import("@/app/api/auth/register/route");
const { POST: nativeLogin } = await import("@/app/api/auth/native-login/route");

let ipCounter = 0;
const nextIp = () => `10.0.0.${++ipCounter}`;

function req(url: string, body: unknown, ip: string) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

const validReg = {
  name: "Test User",
  email: "t@example.com",
  password: "Passw0rdX",
  confirmPassword: "Passw0rdX",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  prisma.user.findUnique.mockResolvedValue(null);
  prisma.user.create.mockResolvedValue({ id: "u1" });
});

describe("Registrierung: FITTRACK_REGISTRATION", () => {
  it("Standard (ungesetzt) und closed mit vorhandenem Nutzer: 403, nichts angelegt", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "existing" });
    expect((await register(req("/api/auth/register", validReg, nextIp()))).status).toBe(403);
    vi.stubEnv("FITTRACK_REGISTRATION", "closed");
    expect((await register(req("/api/auth/register", validReg, nextIp()))).status).toBe(403);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("unbekannter Wert zählt als closed", async () => {
    vi.stubEnv("FITTRACK_REGISTRATION", "yes");
    prisma.user.findFirst.mockResolvedValue({ id: "existing" });
    expect((await register(req("/api/auth/register", validReg, nextIp()))).status).toBe(403);
  });

  it("open: Registrierung klappt (201), ohne Nutzer-Abfrage", async () => {
    vi.stubEnv("FITTRACK_REGISTRATION", "open");
    const res = await register(req("/api/auth/register", validReg, nextIp()));
    expect(res.status).toBe(201);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("Bootstrap: closed, aber noch kein Nutzer: 201", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    const res = await register(req("/api/auth/register", validReg, nextIp()));
    expect(res.status).toBe(201);
    expect(prisma.user.create).toHaveBeenCalledOnce();
  });
});

describe("Rate-Limit Registrierung", () => {
  it("429 mit Retry-After ab dem 11. Versuch pro IP; andere IP unberührt", async () => {
    vi.stubEnv("FITTRACK_REGISTRATION", "open");
    const ip = nextIp();
    for (let i = 0; i < 10; i++) {
      expect((await register(req("/api/auth/register", validReg, ip))).status).toBe(201);
    }
    const res = await register(req("/api/auth/register", validReg, ip));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await register(req("/api/auth/register", validReg, nextIp()))).status).toBe(201);
  });
});

describe("Rate-Limit native-login", () => {
  const user = { id: "u1", email: "t@example.com", name: "T", passwordHash: "h" };
  const creds = { email: "t@example.com", password: "x" };

  it("429 nach 20 Versuchen; Erfolg setzt den Zähler zurück", async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.apiToken.create.mockResolvedValue({});
    const ip = nextIp();

    compare.mockResolvedValue(false);
    for (let i = 0; i < 19; i++) {
      expect((await nativeLogin(req("/api/auth/native-login", creds, ip))).status).toBe(401);
    }
    compare.mockResolvedValue(true);
    expect((await nativeLogin(req("/api/auth/native-login", creds, ip))).status).toBe(200);

    // Zähler zurückgesetzt: wieder 20 Versuche frei
    compare.mockResolvedValue(false);
    for (let i = 0; i < 20; i++) {
      expect((await nativeLogin(req("/api/auth/native-login", creds, ip))).status).toBe(401);
    }
    const blocked = await nativeLogin(req("/api/auth/native-login", creds, ip));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    // auch korrekte Zugangsdaten werden während der Sperre abgewiesen, ohne bcrypt
    compare.mockClear();
    compare.mockResolvedValue(true);
    expect((await nativeLogin(req("/api/auth/native-login", creds, ip))).status).toBe(429);
    expect(compare).not.toHaveBeenCalled();
  });
});
