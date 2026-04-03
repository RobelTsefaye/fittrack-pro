# FitTrack Pro

Intelligent fitness tracking app — portfolio project.

## Tech Stack
Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Prisma, PostgreSQL, NextAuth.js v5, Zod, Recharts

## Commands
- `npm run dev` — start dev server
- `npx prisma dev` — start local Prisma Postgres + run migrations
- `npx prisma studio` — database GUI
- `npx prisma migrate dev` — create/apply migrations (development)
- `npm run db:migrate` — `prisma migrate deploy` (apply existing migrations, e.g. production)
- `npm run db:push` — `prisma db push` (sync **entire** `schema.prisma` to DB without migration files — use when you see **missing column** errors locally)
- `npx prisma generate` — regenerate Prisma client (also runs on `npm install` via `postinstall` and before `next build`)

### “Column X does not exist” (e.g. `workouts.planSessionId`)
The app schema is ahead of your database. After `DATABASE_URL` is set, run **`npm run db:push`** (simplest for local) **or** **`npm run db:migrate`** (applies `prisma/migrations`). Then restart `npm run dev`.

## Architecture
- `src/app/` — Next.js pages and API routes
- `src/app/api/ai/` — structured JSON for LLMs (`coach-context`, `training-summary`, `progress-report`, `recommendations`); see `project-docs/ai-api.md`
- **API tokens** (Settings): `Authorization: Bearer ftp_…` for `/api/ai/*` and `/api/export` without a browser session  
- **Claude Desktop (persistent):** `mcp/fittrack-mcp` — MCP server; configure URL + token once in `claude_desktop_config.json` (see `mcp/fittrack-mcp/README.md`)
- `src/features/` — feature-specific code (components, actions, schemas)
- `src/services/` — business logic layer
- `src/components/` — shared UI components (shadcn/ui in components/ui/)
- `src/lib/` — utilities (prisma client, auth config, constants)
- `prisma/` — database schema and migrations

## Key Patterns
- Zod validation on all inputs (shared client/server)
- Server actions for mutations, route handlers for queries
- Feature-based folder organization
- Type-safe end-to-end via Prisma generated types
- Route groups: `(auth)` for public, `(app)` for protected routes

## Documentation
All project docs in `project-docs/` — keep updated when making changes.
