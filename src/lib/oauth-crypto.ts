import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

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
