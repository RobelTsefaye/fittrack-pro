import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * OAuth-Routen des MCP-Connectors (authorize / token / register).
 *
 * Grüne Tests belegen, was heute korrekt ist (Login erforderlich, Code-Roundtrip, PKCE-Prüfung
 * Pflicht, Ablauf des Codes). Behoben (FT-SEC-02, ohne Schema): signierte client_id mit gebundenen
 * redirect_uris, exakter Vergleich in authorize und token, PKCE S256 Pflicht. Als `it.fails`
 * bleiben nur Punkte, die Zustand/Schema brauchen (Einmal-Code, Token-Ablauf).
 */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  apiTokenCreate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: { apiToken: { create: mocks.apiTokenCreate } },
}));

import { GET as authorize } from "../authorize/route";
import { POST as token } from "../token/route";
import { POST as register } from "../register/route";
import { encryptOAuthCode } from "@/lib/oauth-crypto";
import { hashApiTokenSecret } from "@/lib/api-token-crypto";

const ORIGIN = "http://localhost:3000";
const GOOD_REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const EVIL_REDIRECT = "https://evil.example/steal";
const VERIFIER = "v".repeat(48);
const CHALLENGE_S256 = createHash("sha256").update(VERIFIER).digest("base64url");

function authorizeReq(params: Record<string, string>) {
  const url = new URL("/api/mcp/oauth/authorize", ORIGIN);
  for (const [k, v] of Object.entries(params)) if (v !== "") url.searchParams.set(k, v);
  return new NextRequest(url);
}

function tokenReq(fields: Record<string, string>) {
  return new NextRequest(new URL("/api/mcp/oauth/token", ORIGIN), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

function registerReq(body: unknown) {
  return new NextRequest(new URL("/api/mcp/oauth/register", ORIGIN), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Registriert einen Client und liefert dessen signierte client_id. */
async function registerClient(redirectUris: string[] = [GOOD_REDIRECT]) {
  const res = await register(registerReq({ client_name: "Test", redirect_uris: redirectUris }));
  return (await res.json()).client_id as string;
}

/** Läuft authorize als eingeloggter Nutzer und liefert den `code` aus der Redirect-URL. */
async function mintCode(params: Record<string, string>) {
  mocks.auth.mockResolvedValue({ user: { id: "user-A" } });
  const client_id = await registerClient();
  const res = await authorize(
    authorizeReq({
      response_type: "code",
      redirect_uri: GOOD_REDIRECT,
      client_id,
      code_challenge: CHALLENGE_S256,
      code_challenge_method: "S256",
      ...params,
    })
  );
  const location = res.headers.get("location");
  const code = location ? new URL(location).searchParams.get("code") : null;
  return { res, location, code };
}

beforeEach(() => {
  mocks.auth.mockReset();
  mocks.apiTokenCreate.mockReset();
  mocks.apiTokenCreate.mockResolvedValue({ id: "tok-1" });
});

describe("authorize: heute korrekt", () => {
  it("ohne Session: Redirect auf /login mit callbackUrl, kein Token wird erzeugt", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await authorize(
      authorizeReq({
        redirect_uri: GOOD_REDIRECT,
        state: "s1",
        client_id: await registerClient(),
        code_challenge: CHALLENGE_S256,
        code_challenge_method: "S256",
      })
    );
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl")).toContain("/api/mcp/oauth/authorize");
    expect(mocks.apiTokenCreate).not.toHaveBeenCalled();
  });

  it("ohne redirect_uri: 400 invalid_request", async () => {
    const res = await authorize(authorizeReq({ client_id: await registerClient() }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_request" });
    expect(mocks.apiTokenCreate).not.toHaveBeenCalled();
  });

  it("mit Session: leitet mit code und state zurück und speichert nur den Token-Hash", async () => {
    const { res, location } = await mintCode({
      state: "xyz",
      code_challenge: CHALLENGE_S256,
      code_challenge_method: "S256",
    });
    expect(res.status).toBeGreaterThanOrEqual(300);
    const back = new URL(location!);
    expect(back.origin + back.pathname).toBe(GOOD_REDIRECT);
    expect(back.searchParams.get("state")).toBe("xyz");
    expect(back.searchParams.get("code")).toBeTruthy();

    expect(mocks.apiTokenCreate).toHaveBeenCalledTimes(1);
    const data = mocks.apiTokenCreate.mock.calls[0][0].data;
    expect(data.userId).toBe("user-A");
    expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(data).not.toHaveProperty("secret");
  });
});

describe("token: heute korrekt", () => {
  it("Roundtrip authorize -> token liefert genau das Secret, dessen Hash gespeichert wurde", async () => {
    const { code } = await mintCode({
      code_challenge: CHALLENGE_S256,
      code_challenge_method: "S256",
    });
    const res = await token(
      tokenReq({
        grant_type: "authorization_code",
        code: code!,
        code_verifier: VERIFIER,
        redirect_uri: GOOD_REDIRECT,
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.token_type).toBe("Bearer");
    expect(body.scope).toBe("mcp");
    expect(hashApiTokenSecret(body.access_token)).toBe(
      mocks.apiTokenCreate.mock.calls[0][0].data.tokenHash
    );
  });

  it("falscher code_verifier: 400 PKCE mismatch", async () => {
    const { code } = await mintCode({
      code_challenge: CHALLENGE_S256,
      code_challenge_method: "S256",
    });
    const res = await token(
      tokenReq({
        grant_type: "authorization_code",
        code: code!,
        code_verifier: "x".repeat(48),
        redirect_uri: GOOD_REDIRECT,
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("kein code_verifier: 400", async () => {
    const { code } = await mintCode({
      code_challenge: CHALLENGE_S256,
      code_challenge_method: "S256",
    });
    const res = await token(
      tokenReq({ grant_type: "authorization_code", code: code!, redirect_uri: GOOD_REDIRECT })
    );
    expect(res.status).toBe(400);
  });

  it("abgelaufener Code: 400 code expired", async () => {
    const code = encryptOAuthCode({
      s: "secret",
      cc: null,
      ccm: "plain",
      ru: GOOD_REDIRECT,
      ci: "c",
      exp: Date.now() - 1000,
    });
    const res = await token(tokenReq({ grant_type: "authorization_code", code }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: "invalid_grant",
      error_description: "code expired",
    });
  });

  it("manipulierter oder fremder Code: 400 bad code", async () => {
    const res = await token(tokenReq({ grant_type: "authorization_code", code: "A".repeat(60) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error_description: "bad code" });
  });

  it("falscher grant_type und fehlender code: 400", async () => {
    expect((await token(tokenReq({ grant_type: "password" }))).status).toBe(400);
    expect((await token(tokenReq({ grant_type: "authorization_code" }))).status).toBe(400);
  });
});

describe("register", () => {
  it("liefert 201 mit signierter, je Registrierung eindeutiger client_id und spiegelt redirect_uris", async () => {
    const res = await register(
      registerReq({ client_name: "Claude", redirect_uris: [GOOD_REDIRECT] })
    );
    expect(res.status).toBe(201);
    const a = await res.json();
    expect(a.client_id).toMatch(/^mcp_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(a.redirect_uris).toEqual([GOOD_REDIRECT]);
    expect(a.token_endpoint_auth_method).toBe("none");
    const b = await (await register(registerReq({ redirect_uris: [GOOD_REDIRECT] }))).json();
    expect(b.client_id).not.toBe(a.client_id);
  });

  it.each([
    ["ohne redirect_uris", {}],
    ["leere Liste", { redirect_uris: [] }],
    ["keine URL", { redirect_uris: ["kein-url"] }],
    ["http auf fremdem Host", { redirect_uris: ["http://evil.example/cb"] }],
    ["javascript-Schema", { redirect_uris: ["javascript:alert(1)"] }],
    ["Fragment", { redirect_uris: ["https://claude.ai/cb#x"] }],
  ])("lehnt ab (400 invalid_redirect_uri): %s", async (_name, body) => {
    const res = await register(registerReq(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_redirect_uri" });
  });

  it("erlaubt http auf Loopback (native Clients)", async () => {
    const res = await register(registerReq({ redirect_uris: ["http://localhost:6274/cb"] }));
    expect(res.status).toBe(201);
  });
});

describe("FT-SEC-02: redirect_uri-Bindung und PKCE (behoben) sowie offene Punkte (it.fails)", () => {
  it("FT-SEC-02: authorize lehnt eine nicht registrierte redirect_uri ab (kein Redirect an Fremd-Host)", async () => {
    const { res, location } = await mintCode({
      redirect_uri: EVIL_REDIRECT,
      client_id: "mcp_unbekannt",
    });
    expect(res.status).toBe(400);
    expect(location ?? "").not.toContain("evil.example");
  });

  it("FT-SEC-02: authorize erzeugt keinen Token für eine nicht registrierte redirect_uri", async () => {
    await mintCode({ redirect_uri: EVIL_REDIRECT, client_id: "mcp_unbekannt" });
    expect(mocks.apiTokenCreate).not.toHaveBeenCalled();
  });

  it("FT-SEC-02: register-Client wird gespeichert und in authorize per client_id + exakter redirect_uri geprüft", async () => {
    const reg = await (await register(registerReq({ redirect_uris: [GOOD_REDIRECT] }))).json();
    const { res } = await mintCode({ client_id: reg.client_id, redirect_uri: EVIL_REDIRECT });
    expect(res.status).toBe(400);
  });

  it("FT-SEC-02: PKCE ist Pflicht (authorize ohne code_challenge wird abgelehnt)", async () => {
    const { res } = await mintCode({ code_challenge: "", code_challenge_method: "" });
    expect(res.status).toBe(400);
    expect(mocks.apiTokenCreate).not.toHaveBeenCalled();
  });

  it("FT-SEC-02: PKCE-Methode plain wird abgelehnt (nur S256)", async () => {
    const { res } = await mintCode({
      code_challenge: "plain-challenge-value",
      code_challenge_method: "plain",
    });
    expect(res.status).toBe(400);
  });

  it("FT-SEC-02: ungültige redirect_uri ergibt 400 statt Exception/500", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-A" } });
    const res = await authorize(authorizeReq({ response_type: "code", redirect_uri: "kein-url" }));
    expect(res.status).toBe(400);
  });

  it("FT-SEC-02: errorRedirect ist kein offener Redirect (auch ohne Login, unbekannter Host)", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await authorize(
      authorizeReq({ response_type: "token", redirect_uri: EVIL_REDIRECT })
    );
    expect(res.headers.get("location") ?? "").not.toContain("evil.example");
  });

  // OFFEN: braucht Zustand (DB-Tabelle/Cache) für den Verbrauchs-Marker, Schema-Änderung nicht freigegeben.
  it.fails("FT-SEC-02: Code ist einmalig einlösbar (zweiter Austausch schlägt fehl)", async () => {
    const { code } = await mintCode({
      code_challenge: CHALLENGE_S256,
      code_challenge_method: "S256",
    });
    const fields = { grant_type: "authorization_code", code: code!, code_verifier: VERIFIER };
    expect((await token(tokenReq(fields))).status).toBe(200);
    expect((await token(tokenReq(fields))).status).toBe(400);
  });

  it("FT-SEC-02: token prüft redirect_uri gegen den Wert aus authorize", async () => {
    const { code } = await mintCode({
      code_challenge: CHALLENGE_S256,
      code_challenge_method: "S256",
    });
    const res = await token(
      tokenReq({
        grant_type: "authorization_code",
        code: code!,
        code_verifier: VERIFIER,
        redirect_uri: EVIL_REDIRECT,
      })
    );
    expect(res.status).toBe(400);
  });

  // OFFEN: ApiToken hat kein expiresAt (Schema, FT-SEC-05); `expires_in` wäre sonst unwahr.
  it.fails("FT-SEC-02: Access-Token hat einen Ablauf (expires_in)", async () => {
    const { code } = await mintCode({
      code_challenge: CHALLENGE_S256,
      code_challenge_method: "S256",
    });
    const res = await token(
      tokenReq({
        grant_type: "authorization_code",
        code: code!,
        code_verifier: VERIFIER,
        redirect_uri: GOOD_REDIRECT,
      })
    );
    const body = await res.json();
    expect(typeof body.expires_in).toBe("number");
  });
});

describe("FT-SEC-02: weitere Prüfungen", () => {
  it("authorize: fremde redirect_uri trotz gültiger client_id und Login: 400, kein Token, kein Redirect", async () => {
    const { res, location } = await mintCode({ redirect_uri: EVIL_REDIRECT });
    expect(res.status).toBe(400);
    expect(location).toBeNull();
    expect(mocks.apiTokenCreate).not.toHaveBeenCalled();
  });

  it("authorize: gefälschte/manipulierte client_id wird abgelehnt", async () => {
    const good = await registerClient();
    const forged = `${good.slice(0, -2)}xx`;
    const { res } = await mintCode({ client_id: forged });
    expect(res.status).toBe(400);
    expect(mocks.apiTokenCreate).not.toHaveBeenCalled();
  });

  it("authorize: redirect_uri wird exakt verglichen (kein Präfix/Zusatz)", async () => {
    const { res } = await mintCode({ redirect_uri: `${GOOD_REDIRECT}/../x` });
    expect(res.status).toBe(400);
    const { res: res2 } = await mintCode({ redirect_uri: `${GOOD_REDIRECT}?a=b` });
    expect(res2.status).toBe(400);
  });

  it("authorize: response_type!=code mit gültigem Client leitet mit error zurück", async () => {
    const { res, location } = await mintCode({ response_type: "token", state: "s" });
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(new URL(location!).searchParams.get("error")).toBe("unsupported_response_type");
    expect(mocks.apiTokenCreate).not.toHaveBeenCalled();
  });

  it("token: Code ohne PKCE-Challenge (Altbestand) wird abgelehnt", async () => {
    const code = encryptOAuthCode({
      s: "secret",
      cc: null,
      ccm: "plain",
      ru: GOOD_REDIRECT,
      ci: "c",
      exp: Date.now() + 60_000,
    });
    const res = await token(
      tokenReq({ grant_type: "authorization_code", code, redirect_uri: GOOD_REDIRECT })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error_description: "PKCE S256 required" });
  });

  it("token: fehlende redirect_uri und abweichende client_id: 400", async () => {
    const { code } = await mintCode({});
    const base = { grant_type: "authorization_code", code: code!, code_verifier: VERIFIER };
    expect((await token(tokenReq(base))).status).toBe(400);
    expect(
      (await token(tokenReq({ ...base, redirect_uri: GOOD_REDIRECT, client_id: "mcp_x.y" }))).status
    ).toBe(400);
  });
});
