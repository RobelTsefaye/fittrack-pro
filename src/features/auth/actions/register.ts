"use server";

import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "../schemas";
import type { ActionResult } from "@/lib/types";
import { LOCALE_COOKIE, prismaLocaleFromCookieString } from "@/lib/i18n-config";

export async function registerUser(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { name, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    return { success: false, error: "An account with this email already exists" };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const cookieStore = await cookies();
  const localeFromCookie = prismaLocaleFromCookieString(
    cookieStore.get(LOCALE_COOKIE)?.value
  );

  const user = await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      passwordHash,
      settings: {
        create: { locale: localeFromCookie },
      },
    },
  });

  return { success: true, data: { id: user.id } };
}
