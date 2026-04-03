import type { NextAuthConfig } from "next-auth";

/**
 * Auth config that is safe to import in Edge Runtime (middleware).
 * No Prisma / Node.js-only imports allowed here.
 */
export const authConfig: NextAuthConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
};
