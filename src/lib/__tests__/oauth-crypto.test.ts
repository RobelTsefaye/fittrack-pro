import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import {
  decryptOAuthCode,
  encryptOAuthCode,
  signOAuthClientId,
  verifyOAuthClientId,
} from "@/lib/oauth-crypto";

/**
 * Characterization von `oauth-crypto.ts` (AES-256-GCM-Codes für den MCP-OAuth-Flow).
 * Die Env-Variablen werden pro Test gesetzt und danach wiederhergestellt.
 */

const KEYS = ["AUTH_SECRET", "NEXTAUTH_SECRET"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function setSecrets(auth?: string, nextauth?: string) {
  for (const [k, v] of [
    ["AUTH_SECRET", auth],
    ["NEXTAUTH_SECRET", nextauth],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("oauth-crypto", () => {
  it("Roundtrip mit gesetztem AUTH_SECRET", () => {
    setSecrets("s3cret-value");
    const payload = { s: "ftp_abc", exp: 123, cc: null };
    expect(decryptOAuthCode(encryptOAuthCode(payload))).toEqual(payload);
  });

  it("Codes sind URL-sicher und nicht deterministisch (zufälliger IV)", () => {
    setSecrets("s3cret-value");
    const a = encryptOAuthCode({ x: 1 });
    const b = encryptOAuthCode({ x: 1 });
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("Entschlüsselung mit anderem Secret schlägt fehl (null)", () => {
    setSecrets("secret-one");
    const code = encryptOAuthCode({ x: 1 });
    setSecrets("secret-two");
    expect(decryptOAuthCode(code)).toBeNull();
  });

  it("manipulierter oder zu kurzer Code liefert null statt zu werfen", () => {
    setSecrets("secret-one");
    const code = encryptOAuthCode({ x: 1 });
    const buf = Buffer.from(code, "base64url");
    buf[buf.length - 1] ^= 0xff;
    expect(decryptOAuthCode(buf.toString("base64url"))).toBeNull();
    expect(decryptOAuthCode("")).toBeNull();
    expect(decryptOAuthCode("abc")).toBeNull();
  });

  it("AUTH_SECRET hat Vorrang vor NEXTAUTH_SECRET; NEXTAUTH_SECRET greift als Fallback", () => {
    setSecrets("primary", "secondary");
    const code = encryptOAuthCode({ x: 1 });
    setSecrets("primary", undefined);
    expect(decryptOAuthCode(code)).toEqual({ x: 1 });
    setSecrets(undefined, "secondary");
    expect(decryptOAuthCode(code)).toBeNull();
    const code2 = encryptOAuthCode({ y: 2 });
    setSecrets(undefined, "secondary");
    expect(decryptOAuthCode(code2)).toEqual({ y: 2 });
  });

  it("IST, vermutlich Finding: ohne AUTH_SECRET/NEXTAUTH_SECRET wird still der feste Schlüssel 'fallback-dev-secret' benutzt", () => {
    setSecrets(undefined, undefined);
    const code = encryptOAuthCode({ s: "ftp_leak" });
    // Unabhängig nachgebaut: Jeder, der den Quelltext kennt, kann solche Codes erzeugen/lesen.
    const key = createHash("sha256").update("fallback-dev-secret").digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([
      cipher.update(JSON.stringify({ s: "forged" }), "utf8"),
      cipher.final(),
    ]);
    const forged = Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64url");
    expect(decryptOAuthCode(code)).toEqual({ s: "ftp_leak" });
    expect(decryptOAuthCode(forged)).toEqual({ s: "forged" });
  });

  it("IST, vermutlich Finding: leerer String als AUTH_SECRET wird NICHT ersetzt (?? statt ||)", () => {
    setSecrets("", undefined);
    const code = encryptOAuthCode({ x: 1 });
    // Schlüssel ist sha256(""), nicht der Fallback.
    setSecrets(undefined, undefined);
    expect(decryptOAuthCode(code)).toBeNull();
    setSecrets("", undefined);
    expect(decryptOAuthCode(code)).toEqual({ x: 1 });
  });

  it("IST: decrypt prüft kein Ablaufdatum; 'exp' wird erst im Token-Endpoint ausgewertet", () => {
    setSecrets("s");
    const expired = { s: "ftp", exp: 1 };
    expect(decryptOAuthCode(encryptOAuthCode(expired))).toEqual(expired);
  });
});

describe("signierte client_id (FT-SEC-02)", () => {
  it("Roundtrip liefert die gebundenen redirect_uris", () => {
    setSecrets("s3cret-value");
    const id = signOAuthClientId(["https://a.example/cb", "http://localhost:1/cb"]);
    expect(verifyOAuthClientId(id)).toEqual({
      redirectUris: ["https://a.example/cb", "http://localhost:1/cb"],
    });
  });

  it("manipuliertes Payload, fremdes Secret und Müll werden abgelehnt (null)", () => {
    setSecrets("secret-one");
    const id = signOAuthClientId(["https://a.example/cb"]);
    const [head, mac] = id.split(".");
    const evil = Buffer.from(JSON.stringify({ u: ["https://evil.example/"] })).toString(
      "base64url"
    );
    expect(verifyOAuthClientId(`mcp_${evil}.${mac}`)).toBeNull();
    expect(verifyOAuthClientId(`${head}.`)).toBeNull();
    expect(verifyOAuthClientId("mcp_abc")).toBeNull();
    expect(verifyOAuthClientId("")).toBeNull();
    setSecrets("secret-two");
    expect(verifyOAuthClientId(id)).toBeNull();
  });
});
