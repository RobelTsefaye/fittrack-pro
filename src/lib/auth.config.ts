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
  // 90-day rolling session — PWA users on mobile shouldn't have to re-auth
  // every month. Sessions auto-extend on activity (updateAge).
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 90, // 90 days
    updateAge: 60 * 60 * 24, // refresh token once per day on activity
  },
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
