# API Routes

All routes prefixed with `/api`. All routes except auth require authentication.

## Auth
| Method | Route | Description |
|--------|-------|-------------|
| — | *(server action)* | Registration via `registerUser` in `src/features/auth/actions/register.ts` (no `/api/auth/register` route) |
| POST | `/api/auth/[...nextauth]` | NextAuth.js handler (login, logout, session) |

## Exercises
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/exercises` | List all exercises (system + user custom) |
| POST | `/api/exercises` | Create custom exercise |
| GET | `/api/exercises/:id` | Get one exercise (system or user’s custom) |
| PATCH | `/api/exercises/:id` | Update exercise |
| DELETE | `/api/exercises/:id` | Delete custom exercise |
| GET | `/api/exercises/:id/history` | History + progress: completed sets, `progressBySession` (best Epley 1RM per workout), `bestPersonalRecord` |

## Workouts
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/workouts` | List workouts (paginated, filterable) |
| POST | `/api/workouts` | Start new workout |
| GET | `/api/workouts/:id` | Get workout with exercises and sets |
| PATCH | `/api/workouts/:id` | Update workout (`name` nullable, `notes`) |
| DELETE | `/api/workouts/:id` | Delete workout |
| POST | `/api/workouts/:id/complete` | Mark workout complete (sets `completedAt`, `durationSeconds`) |
| POST | `/api/workouts/:id/exercises` | Add exercise to workout |
| PATCH | `/api/workouts/:id/exercises/:weId` | Set `supersetGroup` with `{ "supersetGroup": number \| null }` for an active workout |
| DELETE | `/api/workouts/:id/exercises/:weId` | Remove exercise from workout |
| POST | `/api/workouts/:id/exercises/:weId/sets` | Add set |
| PATCH | `/api/workouts/:id/sets/:setId` | Update set (reps, weight, complete); verifies set belongs to workout; may create `PersonalRecord` when first completing a working set with weight + reps (beats prior best Epley 1RM) |
| DELETE | `/api/workouts/:id/sets/:setId` | Delete set (removes linked `PersonalRecord` if any) |

## Body Weight
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/body-weight` | Get body weight entries (date range) |
| POST | `/api/body-weight` | Log body weight (`date` `YYYY-MM-DD`); **upserts** same user + calendar day |
| PATCH | `/api/body-weight/:id` | Update entry |
| DELETE | `/api/body-weight/:id` | Delete entry |

## Dashboard / Analytics
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/dashboard/summary` | Overview: total completed workouts, this week/month counts, PR count, workout streak (consecutive days with a completed workout from last session day backward) |
| GET | `/api/dashboard/prs` | Recent PR rows with exercise; `?limit=` (default 10, max 50) |
| GET | `/api/dashboard/volume` | Volume buckets: `?period=week` (default, ~10 Mon-start weeks) or `?period=month` (~6 months); volume = Σ(weight× reps) working sets |
| GET | `/api/dashboard/progress/:exerciseId` | Per-workout best Epley 1RM series for one exercise (same bucketing as exercise history) |
| GET | `/api/dashboard/consistency` | Completed workouts per Mon-start week (~10 weeks) |
| GET | `/api/dashboard/body-weight-trend` | Last entries for charts; `?limit=` (default 14, max 60) |

*The dashboard page loads data via `getDashboardClientPayload` (Prisma) in one server round-trip; the routes above mirror the same logic for API consumers.*

## API tokens (session only to manage)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/tokens` | List your tokens (prefix + metadata only). Requires logged-in session. |
| POST | `/api/tokens` | Create token; response includes full secret once. Body: `{ "name"?: string }`. |
| DELETE | `/api/tokens/[id]` | Revoke a token. |

## Calendar
| Method | Route | Description |
|---|---|---|
| GET | `/api/calendar/schedule?today=YYYY-MM-DD&horizonDays=28` | Returns separately enabled `training` and `cardio` calendars with final per-event time and duration. |
| GET | `/api/calendar/plan?kind=training|cardio&today=YYYY-MM-DD` | Returns base calendar slots and their stored override state for the editor. |
| PUT | `/api/calendar/overrides` | Upserts a skip, move, time, or duration override for an original slot date. |
| DELETE | `/api/calendar/overrides?kind=…&date=YYYY-MM-DD` | Resets one slot to its global defaults. |

## AI / structured context
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/ai/coach-context` | LLM-oriented snapshot: latest body weight, active workouts, plan rotation / suggested next session, recent completions. See `project-docs/ai-api.md`. |
| GET | `/api/ai/training-summary` | Structured training snapshot for LLMs: `?weeks=` (default 8, max 24). See `project-docs/ai-api.md`. |
| GET | `/api/ai/progress-report` | Progress report + analysis: `?weeks=` (default 12, max 52); embedded summary capped at 24 weeks. |
| GET | `/api/ai/recommendations` | Heuristic suggestions (`source: heuristic`); not a substitute for medical advice. |
| GET | `/api/export` | Export all user data as JSON (full backup shape). |
| GET | `/api/export/csv` | Workouts / sets CSV export. |

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
