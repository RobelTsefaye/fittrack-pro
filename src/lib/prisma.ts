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

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
