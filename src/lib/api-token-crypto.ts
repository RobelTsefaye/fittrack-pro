import { createHash, randomBytes } from "crypto";

const PREFIX = "ftp_";

/** New secret shown once to the user (Claude / MCP `Authorization: Bearer …`). */
export function generateApiTokenSecret(): string {
  return PREFIX + randomBytes(32).toString("base64url");
}

export function hashApiTokenSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** Short label for lists (full secret is never stored). */
export function apiTokenPrefixLabel(secret: string): string {
  const n = 14;
  return secret.length <= n ? secret : `${secret.slice(0, n)}…`;
}
