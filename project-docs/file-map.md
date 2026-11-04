# File Map

```
FitnessApp/
├── project-docs/                    # Project documentation
│   ├── project-summary.md
│   ├── architecture.md
│   ├── database-schema.md
│   ├── api-routes.md
│   ├── ai-api.md                    # AI / LLM-oriented endpoints
│   ├── apple-watch.md               # Watch app: screens, cardio after a day, phone ↔ Watch messages
│   ├── file-map.md                  # ← You are here
│   ├── roadmap.md
│   └── handoff-prompt.md
│
├── prisma/
│   ├── schema.prisma                # Database schema
│   ├── seed.ts                      # Seed data (default exercises)
│   └── migrations/                  # Auto-generated migrations
│
├── src/
│   ├── app/                         # Next.js App Router
│   │   ├── layout.tsx               # Root layout (providers, fonts)
│   │   ├── page.tsx                 # Landing page
│   │   ├── globals.css              # Tailwind + global styles
│   │   │
│   │   ├── (auth)/                  # Auth route group (no layout nesting)
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   │
│   │   ├── (app)/                   # Authenticated app route group
│   │   │   ├── layout.tsx           # App shell (sidebar, nav)
│   │   │   ├── dashboard/page.tsx   # Server: settings + getDashboardClientPayload → DashboardAnalytics
│   │   │   ├── workouts/
│   │   │   │   ├── page.tsx         # Workout history (WorkoutHistoryList)
│   │   │   │   ├── new/
│   │   │   │   │   ├── layout.tsx   # Page title metadata
│   │   │   │   │   └── page.tsx     # Start new workout (client)
│   │   │   │   └── [id]/
│   │   │   │       ├── layout.tsx   # Page title metadata
│   │   │   │       └── page.tsx     # Workout detail (server: settings → WorkoutDetail)
│   │   │   ├── exercises/
│   │   │   │   ├── page.tsx         # Exercise library
│   │   │   │   └── [id]/
│   │   │   │       ├── layout.tsx
│   │   │   │       └── page.tsx     # Exercise detail (history + charts + PR)
│   │   │   ├── body-weight/
│   │   │   │   └── page.tsx         # BodyWeightTracker (server: settings)
│   │   │   └── settings/
│   │   │       └── page.tsx         # User settings
│   │   │
│   │   └── api/                     # API route handlers
│   │       ├── auth/
│   │       │   └── [...nextauth]/route.ts
│   │       ├── exercises/
│   │       │   ├── route.ts         # GET list, POST create
│   │       │   └── [id]/
│   │       │       ├── route.ts     # GET, PATCH, DELETE
│   │       │       └── history/route.ts
│   │       ├── workouts/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       ├── route.ts
│   │       │       ├── complete/route.ts
│   │       │       ├── exercises/
│   │       │       │   ├── route.ts
│   │       │       │   └── [weId]/
│   │       │       │       ├── route.ts   # DELETE only
│   │       │       │       └── sets/route.ts
│   │       │       └── sets/
│   │       │           └── [setId]/route.ts
│   │       ├── body-weight/
│   │       │   ├── route.ts         # GET, POST (day upsert)
│   │       │   └── [id]/route.ts    # PATCH, DELETE
│   │       ├── dashboard/
│   │       │   ├── summary/route.ts
│   │       │   ├── prs/route.ts
│   │       │   ├── volume/route.ts
│   │       │   ├── consistency/route.ts
│   │       │   ├── body-weight-trend/route.ts
│   │       │   └── progress/[exerciseId]/route.ts
│   │       ├── ai/
│   │       │   ├── training-summary/route.ts
│   │       │   ├── progress-report/route.ts
│   │       │   └── recommendations/route.ts
│   │       ├── export/
│   │       │   ├── route.ts         # Full user JSON
│   │       │   └── csv/route.ts
│   │       ├── plans/               # + plan-sessions/, plan-session-exercises/ (templates)
│   │       └── settings/route.ts
│   │
│   ├── components/                  # Shared UI components
│   │   ├── ui/                      # shadcn/ui primitives
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   └── ...
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── navbar.tsx
│   │   │   └── mobile-nav.tsx
│   │   ├── charts/                  # (planned)
│   │   └── common/                  # (planned)
│   │
│   ├── features/                    # Feature-specific code
│   │   ├── auth/
│   │   │   ├── components/          # Login form, register form
│   │   │   ├── actions/             # Server actions
│   │   │   └── schemas.ts           # Zod schemas
│   │   ├── workouts/
│   │   │   ├── components/
│   │   │   │   ├── exercise-picker-dialog.tsx
│   │   │   │   ├── rest-timer-bar.tsx
│   │   │   │   ├── set-row.tsx
│   │   │   │   ├── workout-detail.tsx
│   │   │   │   └── workout-history-list.tsx
│   │   │   ├── hooks/               # useRestTimer, useWorkoutTimer
│   │   │   └── schemas.ts
│   │   ├── exercises/
│   │   │   ├── history-core.ts      # Shared sets query + progress bucketing (history + dashboard progress API)
│   │   │   ├── components/
│   │   │   │   ├── exercise-card.tsx
│   │   │   │   ├── exercise-detail-view.tsx
│   │   │   │   ├── exercise-progress-chart.tsx
│   │   │   │   └── ...
│   │   │   ├── actions/
│   │   │   └── schemas.ts
│   │   ├── dashboard/
│   │   │   ├── queries.ts           # Prisma aggregations for dashboard + serializer for client props
│   │   │   └── components/
│   │   │       └── dashboard-analytics.tsx
│   │   ├── ai/
│   │   │   ├── context.ts           # buildTrainingSummary, buildProgressReport, buildHeuristicRecommendations
│   │   │   ├── week-stats.ts        # Working-set counts per week (AI summaries)
│   │   │   └── schemas.ts           # Query clamps (weeks)
│   │   ├── plans/                   # Workout plan templates (sessions, exercises, start → workout)
│   │   ├── tracking/
│   │   │   ├── components/
│   │   │   │   └── body-weight-tracker.tsx
│   │   │   └── schemas.ts
│   │
│   ├── lib/                         # Shared utilities
│   │   ├── prisma.ts                # Prisma client singleton
│   │   ├── auth.ts                  # NextAuth config
│   │   ├── utils.ts                 # General utilities
│   │   ├── constants.ts             # App-wide constants + exercisePath()
│   │   ├── types.ts                 # Shared TypeScript types
│   │   ├── strength.ts              # Epley 1RM
│   │   ├── personal-record.ts     # PR create/remove helpers
│   │   └── date-only.ts             # UTC / local date helpers for body weight
│   │
│   └── services/                    # Business logic layer (planned)
│
├── public/                          # Static assets
│   └── icons/
│
├── .env.local                       # Environment variables (git-ignored)
├── .env.example                     # Example env file
├── next.config.ts                   # Next.js config
├── tailwind.config.ts               # Tailwind config
├── tsconfig.json                    # TypeScript config
├── package.json
├── .gitignore
└── CLAUDE.md                        # Project context for Claude Code
```

## Key Conventions
- **Route groups** `(auth)` and `(app)` separate public and protected routes
- **Feature folders** contain all code specific to that domain
- **Services** hold business logic, called by API routes and server actions
- **lib/** holds cross-cutting utilities
- **components/ui/** holds shadcn/ui primitives (auto-generated)
