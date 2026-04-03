# Development Roadmap

## Phase 1: Foundation & Auth ← CURRENT
**Goal**: Working app skeleton with auth and navigation

- [x] Architecture planning & documentation
- [ ] Initialize Next.js project with TypeScript
- [ ] Configure Tailwind CSS + shadcn/ui
- [ ] Set up Prisma with PostgreSQL
- [ ] Define complete database schema
- [ ] Implement user registration
- [ ] Implement login with NextAuth.js
- [ ] Create app shell (sidebar, navbar, layout)
- [ ] Protected route middleware
- [ ] User settings page (weight unit, theme)

**Deliverable**: User can register, log in, see the app shell, and access settings.

---

## Phase 2: Exercise Library
**Goal**: Full CRUD for exercises

- [ ] Seed database with default exercises
- [ ] Exercise list page with search/filter
- [ ] Create custom exercise form
- [ ] Edit/delete exercises
- [ ] Muscle group categorization
- [ ] Exercise detail page

**Deliverable**: User can browse, create, edit, and delete exercises.

---

## Phase 3: Workout Tracking
**Goal**: Core workout logging functionality

- [ ] Start new workout flow
- [ ] Add exercises to active workout
- [ ] Log sets (reps, weight, RPE)
- [ ] Rest timer between sets
- [ ] Workout timer (elapsed time)
- [ ] Complete workout
- [ ] Workout history list
- [ ] Workout detail view

**Deliverable**: User can log a full workout with exercises and sets.

---

## Phase 4: Body Weight & Progress Tracking
**Goal**: Track body composition and exercise progress

- [ ] Body weight logging page
- [ ] Body weight chart (Recharts)
- [ ] Exercise history page (all sets over time)
- [ ] Strength progress chart per exercise
- [ ] Personal record detection & storage

**Deliverable**: User can track body weight and see exercise progress over time.

---

## Phase 5: Dashboard & Analytics
**Goal**: Intelligent dashboard with insights

- [ ] Dashboard layout with card grid
- [ ] Total workouts / this week / this month
- [ ] Training volume chart (weekly/monthly)
- [ ] PR highlights
- [ ] Workout consistency / streak
- [ ] Body weight trend mini-chart
- [ ] Recent workouts list
- [ ] Top exercises by volume

**Deliverable**: Professional analytics dashboard with key metrics.

---

## Phase 6: Advanced Features
**Goal**: Polish and intelligence

- [ ] 1RM estimation (Epley formula)
- [ ] Plateau detection algorithm
- [ ] Smart deload suggestions
- [ ] GitHub-style workout heatmap
- [ ] Training streak tracker
- [ ] Export data as JSON/CSV
- [ ] Dark mode toggle
- [ ] Mobile-responsive refinements
- [ ] PWA support (service worker, manifest)

**Deliverable**: Polished app with intelligent features.

---

## Phase 7: AI Integration Layer
**Goal**: Make the app Claude-ready

- [ ] Structured training summary endpoint
- [ ] Progress report endpoint
- [ ] AI recommendations endpoint
- [ ] Data export endpoint (full user data)
- [ ] API documentation for AI consumption
- [ ] Optional: Claude integration demo

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
