# File Map

```
FitnessApp/
├── project-docs/                    # Project documentation
│   ├── project-summary.md
│   ├── architecture.md
│   ├── database-schema.md
│   ├── api-routes.md
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
│   │   │   ├── dashboard/page.tsx   # Main dashboard
│   │   │   ├── workouts/
│   │   │   │   ├── page.tsx         # Workout history list
│   │   │   │   ├── new/page.tsx     # Start new workout
│   │   │   │   └── [id]/page.tsx    # Active/completed workout detail
│   │   │   ├── exercises/
│   │   │   │   ├── page.tsx         # Exercise library
│   │   │   │   └── [id]/page.tsx    # Exercise detail + history
│   │   │   ├── body-weight/
│   │   │   │   └── page.tsx         # Body weight log + chart
│   │   │   └── settings/
│   │   │       └── page.tsx         # User settings
│   │   │
│   │   └── api/                     # API route handlers
│   │       ├── auth/
│   │       │   ├── register/route.ts
│   │       │   └── [...nextauth]/route.ts
│   │       ├── exercises/
│   │       │   ├── route.ts         # GET list, POST create
│   │       │   └── [id]/
│   │       │       ├── route.ts     # PATCH, DELETE
│   │       │       └── history/route.ts
│   │       ├── workouts/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       ├── route.ts
│   │       │       ├── exercises/
│   │       │       │   ├── route.ts
│   │       │       │   └── [weId]/
│   │       │       │       ├── route.ts
│   │       │       │       └── sets/route.ts
│   │       │       └── sets/
│   │       │           └── [setId]/route.ts
│   │       ├── body-weight/
│   │       │   ├── route.ts
│   │       │   └── [id]/route.ts
│   │       ├── dashboard/
│   │       │   ├── summary/route.ts
│   │       │   ├── prs/route.ts
│   │       │   ├── volume/route.ts
│   │       │   ├── progress/[exerciseId]/route.ts
│   │       │   ├── consistency/route.ts
│   │       │   └── body-weight-trend/route.ts
│   │       └── export/
│   │           └── route.ts
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
│   │   ├── charts/
│   │   │   ├── weight-chart.tsx
│   │   │   ├── volume-chart.tsx
│   │   │   └── progress-chart.tsx
│   │   └── common/
│   │       ├── loading.tsx
│   │       ├── error-boundary.tsx
│   │       └── empty-state.tsx
│   │
│   ├── features/                    # Feature-specific code
│   │   ├── auth/
│   │   │   ├── components/          # Login form, register form
│   │   │   ├── actions/             # Server actions
│   │   │   └── schemas.ts           # Zod schemas
│   │   ├── workouts/
│   │   │   ├── components/          # Workout card, set row, etc.
│   │   │   ├── actions/
│   │   │   ├── hooks/               # useRestTimer, useWorkoutTimer
│   │   │   └── schemas.ts
│   │   ├── exercises/
│   │   │   ├── components/
│   │   │   ├── actions/
│   │   │   └── schemas.ts
│   │   ├── tracking/
│   │   │   ├── components/
│   │   │   ├── actions/
│   │   │   └── schemas.ts
│   │   └── dashboard/
│   │       ├── components/          # Dashboard cards, stat widgets
│   │       └── actions/
│   │
│   ├── lib/                         # Shared utilities
│   │   ├── prisma.ts                # Prisma client singleton
│   │   ├── auth.ts                  # NextAuth config
│   │   ├── utils.ts                 # General utilities
│   │   ├── constants.ts             # App-wide constants
│   │   └── types.ts                 # Shared TypeScript types
│   │
│   └── services/                    # Business logic layer
│       ├── workout-service.ts
│       ├── exercise-service.ts
│       ├── tracking-service.ts
│       ├── analytics-service.ts
│       └── pr-service.ts
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
