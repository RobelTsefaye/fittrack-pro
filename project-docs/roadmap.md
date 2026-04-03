# Development Roadmap

## Phase 1: Foundation & Auth ← COMPLETED
**Goal**: Working app skeleton with auth and navigation

- [x] Architecture planning & documentation
- [x] Initialize Next.js project with TypeScript
- [x] Configure Tailwind CSS + shadcn/ui
- [x] Set up Prisma with PostgreSQL
- [x] Define complete database schema
- [x] Implement user registration
- [x] Implement login with NextAuth.js
- [x] Create app shell (sidebar, navbar, layout)
- [x] Protected route middleware
- [x] User settings page (weight unit, theme)

**Deliverable**: User can register, log in, see the app shell, and access settings.

---

## Phase 2: Exercise Library ← COMPLETED
**Goal**: Full CRUD for exercises

- [x] Seed database with default exercises (65 exercises across 12 muscle groups)
- [x] Exercise list page with search/filter
- [x] Create custom exercise form (dialog)
- [x] Edit/delete exercises
- [x] Muscle group categorization (grouped list view)
- [x] Exercise detail page (inline with cards)

**Deliverable**: User can browse, create, edit, and delete exercises.

---

## Phase 3: Workout Tracking ← COMPLETED
**Goal**: Core workout logging functionality

- [x] Start new workout flow (`/workouts/new` → `POST /api/workouts`)
- [x] Add exercises to active workout (picker + `POST .../exercises`, auto-first set)
- [x] Log sets (reps, weight, RPE) + warmup sets
- [x] Rest timer between sets (uses `UserSettings.restTimerDefault`)
- [x] Workout timer (elapsed time)
- [x] Complete workout (`POST /api/workouts/:id/complete`)
- [x] Workout history list (`/workouts`)
- [x] Workout detail view (`/workouts/[id]` — active read/write, completed read-only)

**Deliverable**: User can log a full workout with exercises and sets.

---

## Phase 4: Body Weight & Progress Tracking ← COMPLETED
**Goal**: Track body composition and exercise progress

- [x] Body weight logging page (`/body-weight`, `GET/POST /api/body-weight`, `PATCH/DELETE /api/body-weight/:id`; same calendar day upserts)
- [x] Body weight chart (Recharts trend)
- [x] Exercise history (`/exercises/[id]`, `GET /api/exercises/:id/history` — set table + session aggregation)
- [x] Strength progress chart per exercise (best Epley 1RM per completed workout)
- [x] Personal record detection & storage (on first completion of a non-warmup set with weight/reps; Epley 1RM must beat prior best; `onDelete: Cascade` from `Set` → `PersonalRecord` in Prisma schema — run `npx prisma migrate dev` locally to apply FK change)

**Deliverable**: User can track body weight and see exercise progress over time.

---

## Phase 5: Dashboard & Analytics ← COMPLETED
**Goal**: Intelligent dashboard with insights

- [x] Dashboard layout with card grid (`DashboardAnalytics`)
- [x] Total workouts / this week / this month (+ PR count & workout streak)
- [x] Training volume chart (weekly/monthly tabs, `GET /api/dashboard/volume?period=week|month`)
- [x] PR highlights (recent PRs with links to exercises)
- [x] Workout consistency (`GET /api/dashboard/consistency`, bar chart per week)
- [x] Body weight trend mini-chart (`GET /api/dashboard/body-weight-trend?limit=`)
- [x] Recent workouts list (links to `/workouts/[id]`)
- [x] Top exercises by volume (rolling 28 days)

**Deliverable**: Professional analytics dashboard with key metrics.

---

## Phase 6: Advanced Features ← COMPLETED
**Goal**: Polish and intelligence

- [x] 1RM estimation (Epley formula — used in history, PRs, charts)
- [x] Plateau detection algorithm *(estimated 1RM flat across 8w halves on top-volume lifts — dashboard + `/api/ai/recommendations`)*
- [x] Smart deload suggestions *(high frequency / grind-without-PR heuristics — dashboard + recommendations)*
- [x] GitHub-style workout heatmap
- [x] Training streak tracker (dashboard + AI summary)
- [x] Export data as JSON/CSV
- [x] Dark mode toggle (settings + next-themes)
- [x] Mobile-responsive refinements (app shell)
- [x] PWA support (manifest; service worker optional later)
- [x] i18n (EN/DE), workout plans, most-used exercise progress view

**Deliverable**: Polished app with intelligent features.

---

## Phase 7: AI Integration Layer ← COMPLETED
**Goal**: Make the app Claude-ready

- [x] Structured training summary endpoint (`GET /api/ai/training-summary`)
- [x] Progress report endpoint (`GET /api/ai/progress-report`)
- [x] AI recommendations endpoint (`GET /api/ai/recommendations` — heuristic rules)
- [x] Data export endpoint (full user data — `GET /api/export`, `GET /api/export/csv`)
- [x] API documentation for AI consumption (`project-docs/ai-api.md`)
- [x] Claude integration demo (`scripts/demo-ai-fetch.mjs` + `mcp/fittrack-mcp`)

**Deliverable**: Clean API endpoints ready for AI analysis.

---

## Timeline Estimate
| Phase | Scope |
|-------|-------|
| Phase 1 | Foundation |
| Phase 2 | Exercises |
| Phase 3 | Workouts |
| Phase 4 | Tracking |
| Phase 5 | Dashboard |
| Phase 6 | Advanced |
| Phase 7 | AI Layer |
