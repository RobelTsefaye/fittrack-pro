import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";

function getKey(): Buffer {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "fallback-dev-secret";
  return createHash("sha256").update(secret).digest();
}

/** Encrypt an object into a URL-safe base64 string (AES-256-GCM). */
export function encryptOAuthCode(payload: object): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = JSON.stringify(payload);
  const enc = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

/** Decrypt a string produced by encryptOAuthCode. Returns null on failure. */
export function decryptOAuthCode(code: string): Record<string, unknown> | null {
  try {
    const key = getKey();
    const buf = Buffer.from(code, "base64url");
    if (buf.length < 29) return null; // 12 iv + 16 tag + 1 min data
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString("utf8"));
  } catch {
    return null;
  }
}

const CLIENT_ID_PREFIX = "mcp_";

/**
 * Zustandslose, signierte client_id (Dynamic Client Registration): `mcp_<payload>.<hmac>`.
 * Das Payload enthält die registrierten redirect_uris; authorize/token prüfen dagegen exakt.
 * Der HMAC-Schlüssel ist aus dem Code-Schlüssel abgeleitet (Domain-Trennung "oauth-client-id").
 */
export function signOAuthClientId(redirectUris: string[]): string {
  const payload = Buffer.from(
    JSON.stringify({ u: redirectUris, i: randomBytes(8).toString("hex") })
  ).toString("base64url");
  return `${CLIENT_ID_PREFIX}${payload}.${clientIdMac(payload)}`;
}

/** Liefert die in der client_id gebundenen redirect_uris oder null bei ungültiger Signatur/Form. */
export function verifyOAuthClientId(clientId: string): { redirectUris: string[] } | null {
  try {
    if (!clientId.startsWith(CLIENT_ID_PREFIX)) return null;
    const [payload, mac, ...rest] = clientId.slice(CLIENT_ID_PREFIX.length).split(".");
    if (!payload || !mac || rest.length > 0) return null;
    const expected = Buffer.from(clientIdMac(payload));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: unknown };
    if (!Array.isArray(data.u) || !data.u.every((u) => typeof u === "string")) return null;
    return { redirectUris: data.u as string[] };
  } catch {
    return null;
  }
}

function clientIdMac(payload: string): string {
  const key = createHmac("sha256", getKey()).update("oauth-client-id").digest();
  return createHmac("sha256", key).update(payload).digest("base64url");
}
