import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { clientKey } from "@/lib/rate-limit";
import { loginLimiter } from "@/lib/auth-rate-limits";
import { authConfig } from "@/lib/auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials, request) {
        const email = credentials.email as string;
        const password = credentials.password as string;

        if (!email || !password) return null;

        // Rate-Limit pro Client-IP (geteilt mit native-login). Bei Überschreitung
        // wie falsche Zugangsdaten behandeln (NextAuth kennt hier kein 429).
        const ipKey = clientKey(request?.headers ?? new Headers());
        if (!loginLimiter().hit(ipKey).ok) return null;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        loginLimiter().reset(ipKey);
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});
