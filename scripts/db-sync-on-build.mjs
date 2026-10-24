#!/usr/bin/env node
/**
 * Brings the production database up to the Prisma schema during the Vercel
 * build, so new columns exist before the new code serves traffic.
 *
 * 1. `prisma migrate deploy` (normal path, uses prisma/migrations)
 * 2. if that fails (e.g. a database managed with `db push`, P3005):
 *    `prisma db push` WITHOUT --accept-data-loss, which only applies
 *    non-destructive changes and refuses anything that would lose data
 * 3. if both fail, exit 1: the build fails and Vercel keeps serving the
 *    previous deployment, so a schema mismatch never reaches users.
 *
 * Skips (exit 0) when no database URL is configured, e.g. CI builds.
 */
import { spawnSync } from "node:child_process";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.log("[db-sync] No DATABASE_URL — skipping schema sync.");
  process.exit(0);
}

function run(args) {
  console.log(`[db-sync] npx prisma ${args.join(" ")}`);
  return spawnSync("npx", ["prisma", ...args], { stdio: "inherit", env: process.env }).status === 0;
}

if (run(["migrate", "deploy"])) process.exit(0);
console.warn("[db-sync] migrate deploy failed — trying a non-destructive db push.");
if (run(["db", "push"])) process.exit(0);

console.error(
  "[db-sync] Could not sync the database schema. Failing the build so the previous deployment stays live.\n" +
    "Run `npm run db:migrate` (or `npm run db:push`) against production, then redeploy."
);
process.exit(1);
