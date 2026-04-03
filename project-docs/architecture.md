# Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│                   Client (Browser)               │
│  Next.js App Router — React Server Components    │
│  ┌─────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │  Pages   │ │Components│ │  Client Hooks    │  │
│  └────┬────┘ └────┬─────┘ └────────┬─────────┘  │
│       │           │                │             │
│       ▼           ▼                ▼             │
│  ┌──────────────────────────────────────────┐    │
│  │         Server Actions / API Routes       │    │
│  └──────────────────┬───────────────────────┘    │
└─────────────────────┼───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│              Service Layer (Business Logic)       │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐   │
│  │ Auth Svc │ │Workout Sv│ │ Analytics Svc  │   │
│  └────┬─────┘ └────┬─────┘ └───────┬────────┘   │
└───────┼─────────────┼───────────────┼────────────┘
        │             │               │
        ▼             ▼               ▼
┌─────────────────────────────────────────────────┐
│           Data Access Layer (Prisma ORM)         │
│                                                  │
│              PostgreSQL Database                  │
└─────────────────────────────────────────────────┘
```

## Design Decisions

### 1. Next.js App Router (not Pages Router)
- Server Components reduce client JS bundle
- Server Actions simplify data mutations
- Layouts and loading states built-in
- Industry direction for React

### 2. Monorepo (not separate frontend/backend)
- Shared TypeScript types end-to-end
- Simpler deployment (one Vercel project)
- Appropriate complexity for this project scope
- API routes co-located with the app

### 3. Layered Architecture
```
UI Layer        → React components, pages, layouts
API Layer       → Route handlers + Server Actions
Service Layer   → Business logic, calculations, validations
Data Layer      → Prisma client, database queries
```
Each layer only talks to the layer directly below it. This keeps concerns separated and makes testing straightforward.

### 4. Feature-Based Organization
Code is organized by domain (auth, workouts, exercises, tracking, dashboard) rather than by technical role. Each feature folder contains its own components, hooks, actions, and types.

### 5. Validation Strategy
- **Zod schemas** define the shape of all inputs
- Shared between client (form validation) and server (API validation)
- Prisma types auto-generated from schema
- Single source of truth for data shapes

### 6. Auth Strategy
- NextAuth.js with credentials provider (email + password)
- Bcrypt password hashing
- JWT session strategy (stateless, scalable)
- Middleware-based route protection

### 7. AI-Ready Design
- All data has timestamps and user associations
- Statistics endpoints return structured JSON
- Exercise and workout data is normalized (not denormalized blobs)
- Summary/aggregation endpoints designed for LLM consumption
