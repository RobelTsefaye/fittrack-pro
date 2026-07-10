import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/features/auth/schemas";
import { LOCALE_COOKIE, prismaLocaleFromCookieString } from "@/lib/i18n-config";

/**
 * Route-handler equivalent of the `registerUser` Server Action
 * (src/features/auth/actions/register.ts) — same validation and Prisma
 * calls, verbatim. Server Actions don't exist in a statically-exported build
 * (project-docs/offline-first-roadmap.md Phase 2), so the client-rendered
 * register form calls this instead. The original Server Action is left
 * in place for the (unconverted) Server Component paths that might still
 * reference it; nothing else currently does.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { name, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const cookieStore = await cookies();
  const localeFromCookie = prismaLocaleFromCookieString(cookieStore.get(LOCALE_COOKIE)?.value);

  const user = await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      passwordHash,
      settings: { create: { locale: localeFromCookie } },
    },
  });

  return NextResponse.json({ data: { id: user.id } }, { status: 201 });
}
