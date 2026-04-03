# API Routes

All routes prefixed with `/api`. All routes except auth require authentication.

## Auth
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/[...nextauth]` | NextAuth.js handler (login, logout, session) |

## Exercises
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/exercises` | List all exercises (system + user custom) |
| POST | `/api/exercises` | Create custom exercise |
| PATCH | `/api/exercises/:id` | Update exercise |
| DELETE | `/api/exercises/:id` | Delete custom exercise |
| GET | `/api/exercises/:id/history` | Get exercise history (all sets across workouts) |

## Workouts
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/workouts` | List workouts (paginated, filterable) |
| POST | `/api/workouts` | Start new workout |
| GET | `/api/workouts/:id` | Get workout with exercises and sets |
| PATCH | `/api/workouts/:id` | Update workout (name, notes, complete) |
| DELETE | `/api/workouts/:id` | Delete workout |
| POST | `/api/workouts/:id/exercises` | Add exercise to workout |
| PATCH | `/api/workouts/:id/exercises/:weId` | Update workout exercise (order, notes) |
| DELETE | `/api/workouts/:id/exercises/:weId` | Remove exercise from workout |
| POST | `/api/workouts/:id/exercises/:weId/sets` | Add set |
| PATCH | `/api/workouts/:id/sets/:setId` | Update set (reps, weight, complete) |
| DELETE | `/api/workouts/:id/sets/:setId` | Delete set |

## Body Weight
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/body-weight` | Get body weight entries (date range) |
| POST | `/api/body-weight` | Log body weight |
| PATCH | `/api/body-weight/:id` | Update entry |
| DELETE | `/api/body-weight/:id` | Delete entry |

## Dashboard / Analytics
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/dashboard/summary` | Overview stats (total workouts, streak, etc.) |
| GET | `/api/dashboard/prs` | Personal records list |
| GET | `/api/dashboard/volume` | Training volume over time |
| GET | `/api/dashboard/progress/:exerciseId` | Strength progress for an exercise |
| GET | `/api/dashboard/consistency` | Workout frequency / consistency data |
| GET | `/api/dashboard/body-weight-trend` | Body weight trend data for charts |

## AI-Ready Endpoints (Future)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/ai/training-summary` | Structured training summary (last N weeks) |
| GET | `/api/ai/progress-report` | Progress report with trends |
| GET | `/api/ai/recommendations` | AI-generated recommendations |
| GET | `/api/export` | Export all user data as JSON |
| GET | `/api/export/csv` | Export as CSV |

## Query Parameters (Common)
- `?page=1&limit=20` — Pagination
- `?from=2026-01-01&to=2026-04-01` — Date range
- `?muscleGroup=CHEST` — Filter by muscle group
- `?sort=date&order=desc` — Sorting

## Response Format
All responses follow this structure:
```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150
  }
}
```

Error responses:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": { ... }
  }
}
```
