# Handoff Prompt

Use this prompt to onboard a new AI assistant or resume work on this project.

---

## Context

You are working on **FitTrack Pro**, a portfolio-grade intelligent fitness tracking app.

### Tech Stack
- Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- PostgreSQL + Prisma ORM
- NextAuth.js v5 for authentication
- Zod for validation
- Recharts for data visualization

### Architecture
- Monorepo: Next.js handles frontend + API
- Layered: UI → API Routes/Server Actions → Services → Prisma/DB
- Feature-based folder organization
- Type-safe end-to-end

### Key Files
- `project-docs/` — All project documentation
- `prisma/schema.prisma` — Database schema
- `src/app/` — Pages and API routes
- `src/features/` — Feature-specific code
- `src/services/` — Business logic
- `src/lib/` — Shared utilities (prisma client, auth config, etc.)

### Current State
Check `project-docs/roadmap.md` for current phase and completed items.

### Coding Standards
- TypeScript strict mode
- Zod validation on all inputs
- Clean error handling (no silent catches)
- Reusable components
- Mobile-first responsive design
- No unnecessary abstractions
- Comments only where logic is non-obvious

### Documentation
Keep these files updated as you work:
1. `project-docs/roadmap.md` — Check off completed items
2. `project-docs/file-map.md` — Add new files/folders
3. `project-docs/api-routes.md` — Add new endpoints
4. `project-docs/database-schema.md` — Schema changes

### How to Run
```bash
npm run dev          # Start dev server
npx prisma studio   # Database GUI
npx prisma migrate dev  # Run migrations
```
