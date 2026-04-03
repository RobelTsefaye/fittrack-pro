import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashApiTokenSecret } from "@/lib/api-token-crypto";

/**
 * Web session (cookie) or `Authorization: Bearer <api_token>` for whitelisted routes.
 * API tokens are created in Settings and only grant access to AI + export endpoints.
 */
export async function resolveUserIdForDataApi(): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) return session.user.id;

  const h = await headers();
  const authz = h.get("authorization");
  if (!authz?.startsWith("Bearer ")) return null;

  const secret = authz.slice(7).trim();
  if (!secret) return null;

  const tokenHash = hashApiTokenSecret(secret);
  const row = await prisma.apiToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true },
  });
  if (!row) return null;

  void prisma.apiToken
    .update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {});

  return row.userId;
}
