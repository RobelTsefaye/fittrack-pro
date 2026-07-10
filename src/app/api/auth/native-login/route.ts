import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { hashApiTokenSecret } from "@/lib/api-token-crypto";

/**
 * Password login for the native (Capacitor) shell — mints a long-lived API
 * token instead of a session cookie. See project-docs/offline-first-roadmap.md
 * Phase 1: a static-exported/client-rendered app has nowhere to keep a
 * server session, so the native shell authenticates the same way
 * WatchAPIProxy's background requests already do (Authorization: Bearer
 * <token>, verified by resolveUserIdForDataApi), just obtained via a
 * credentials login instead of being manually created in Settings.
 *
 * Reuses the exact password-check `auth.ts`'s Credentials provider uses
 * (bcrypt against `user.passwordHash`) — this route does NOT create a
 * NextAuth session; the browser/cookie login flow is untouched.
 */

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  // 32 random bytes hex-encoded — same secret shape as the tokens created in
  // Settings; `ftp_` prefix matches CLAUDE.md's documented Bearer format.
  const secret = `ftp_${randomBytes(32).toString("hex")}`;
  const tokenHash = hashApiTokenSecret(secret);

  await prisma.apiToken.create({
    data: {
      userId: user.id,
      name: "Native App Login",
      tokenHash,
      tokenPrefix: secret.slice(0, 12),
    },
  });

  // The raw secret is only ever returned here, exactly once — same
  // one-shot-reveal convention as the Settings token creation flow.
  return NextResponse.json({
    data: {
      token: secret,
      user: { id: user.id, email: user.email, name: user.name },
    },
  });
}
