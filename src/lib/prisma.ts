import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getConnectionString(): string {
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Missing DATABASE_URL or DIRECT_DATABASE_URL. " +
        "Set one in .env (local) or in your hosting provider's environment variables (production)."
    );
  }
  return url;
}

function createPrismaClient() {
  const adapter = new PrismaPg(getConnectionString());
  return new PrismaClient({ adapter });
}

// Lazy: the real client (and its `getConnectionString()` env var check) is
// only constructed on first actual use (e.g. `prisma.user.findMany(...)`),
// not just from importing this module. Next's build-time "collect page
// data" step evaluates route modules — including shared chunks unrelated
// pages like `/_not-found` pull in — in an environment that doesn't
// necessarily have runtime env vars (like DATABASE_URL) populated; eagerly
// throwing at module scope broke that step. Every real request path already
// runs where the env vars are guaranteed present, so the deferred check
// still fails loudly if genuinely misconfigured — just no longer during a
// build step that never actually queries the database.
function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrismaClient(), prop, receiver);
  },
});
