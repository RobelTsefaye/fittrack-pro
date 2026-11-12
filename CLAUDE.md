# FitTrack Pro

Intelligent fitness tracking app — portfolio project.

## Tech Stack
Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Prisma 7, PostgreSQL (Neon), NextAuth.js v5 (beta), Zod 4, Recharts, AI SDK 6, Capacitor 8 (iOS-App mit Watch/Widgets). **Next.js 16 weicht von älterem Wissen ab: siehe `AGENTS.md`, Doku in `node_modules/next/dist/docs/`.**

## Commands
- `npm run dev` — start dev server
- `npm test` — Vitest unit tests (`src/**/__tests__/*.test.ts`); `npm run typecheck`; `npm run lint`
- `npx tsx scripts/seed-demo.ts <email>` — local-only demo data (PPL plan, 6 weeks of workouts, body weight) for UI previews; refuses non-localhost DBs
- `npm run format -- <files>` — Prettier (opt-in per file; repo is not mass-formatted to avoid branch conflicts)
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
- **Mobile:** Capacitor-iOS-App (`ios/App`, Build `npm run sync:native`, danach `open ios/App/App.xcodeproj`) mit HealthKit, Watch und Widgets; zusätzlich Safari / “Add to Home Screen”. Rest timer = wall-clock + `sessionStorage`.
- **Betrieb:** Seit Nov 2026 selbst gehostet auf dem Mac (`scripts/selfhost.sh`, launchd `com.fittrack.web`, Port 3005, Tailscale Funnel :443); Vercel ist pausiert (Hobby-Limit). Node 22 (`.nvmrc`).

## Key Patterns
- Zod validation on all inputs (shared client/server)
- Server actions for mutations, route handlers for queries
- API route handlers: `export const GET = withApi(async function GET(...) { const userId = await requireUserId(); ... })` — see `src/lib/api/route-handler.ts`
- Feature-based folder organization
- Type-safe end-to-end via Prisma generated types
- Route groups: `(auth)` for public, `(app)` for protected routes

## Documentation
All project docs in `project-docs/` — keep updated when making changes.

## Refactoring-Regeln (Audit 2026-11)
- Branch `refactor/audit-2026-11`; nicht auf `main` pushen, solange Robel es nicht ausdrücklich erlaubt.
- Kleine Commits, nach jedem Commit Tests grün. Kein Verhalten ändern; im Zweifel dokumentieren statt fixen (`docs/audit/`).
- Fixes in eigenen Worktrees/Branches `refactor/<ID>`; Änderungen an Prisma-Schema und Migrationen nie parallel.
- Keine `.env`, `data/` oder Datenbankinhalte lesen, committen oder ausgeben; keine Modellnamen in Commits/Code/Doku.
