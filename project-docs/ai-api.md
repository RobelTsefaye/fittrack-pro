# AI & automation API

Authenticated JSON endpoints designed for **LLM context**, analytics pipelines, or mobile clients. They intentionally **omit email addresses** and passwords.

Base URL: same origin as the app, path prefix `/api/ai/`.

## Authentication

1. **Browser session** — same cookies as the web app after login.
2. **Personal API token** — create one in **Settings → API token**. Send it on each request:

```http
Authorization: Bearer ftp_<your-secret>
```

Tokens are stored as a SHA-256 hash; the full secret is shown **once** when created. Revoke anytime from Settings.

**Scope:** tokens authenticate only **read-oriented data routes**: all `GET /api/ai/*` and `GET /api/export` / `GET /api/export/csv`. They cannot create workouts, change settings, or mint new tokens (those still require a normal login session).

Unauthenticated requests return `401`.

### “Set it once” with Claude Desktop

The token is **long-lived** — you are not meant to generate it every chat. For a **persistent** link so Claude can call your API automatically, use the **MCP server** in this repo:

- `mcp/fittrack-mcp/README.md` — build steps and `claude_desktop_config.json` example  
- After setup, Claude Desktop loads `FITTRACK_BASE_URL` and `FITTRACK_API_TOKEN` from env on every session; you only rotate the token if you revoke it or switch machines.

Plain **claude.ai** in the browser does not run your MCP server; use **Claude Desktop** (or Cursor MCP) for that model.

**Quick CLI demo** (after creating an API token): set `FITTRACK_BASE_URL` and `FITTRACK_API_TOKEN`, then run `npm run demo:ai` — prints `GET /api/ai/coach-context` JSON to stdout (`scripts/demo-ai-fetch.mjs`).

## Endpoints

### `GET /api/ai/training-summary`

Compact snapshot for prompt injection or RAG context.

| Query | Default | Max | Description |
|-------|---------|-----|-------------|
| `weeks` | 8 | 24 | Mon-start weeks of history |

**Response `data` highlights:**

- `schemaVersion`, `kind: "training-summary"`, `generatedAt`, `windowWeeks`
- `athlete`: `displayName`, `weightUnit`, `locale`, `defaultRestSeconds`
- `snapshot`: dashboard-style totals (all-time / current streak / PR count) from `getDashboardSummary`
- `window.weekBuckets[]`: per week — `weekStart`, `completedWorkouts`, `volumeLoad` (Σ weight×reps working sets), `workingSets`
- `window.dailyVolume[]`: per day (last `min(weeks*7, 60)` days) — `date`, `volume` (0 on rest days)
- `window.totals`: sums over the window
- `bodyWeightTrend[]`: logged body-weight entries (`date`, `weight`) in the same day window — only days with an actual log appear, not filled with nulls
- `nutrition`: daily calorie/macro trend over the same day window, see `NutritionTrend` shape below
- `topExercisesByVolume`: top 15 in the window by volume load
- `recentPersonalRecords`: last 10 PR rows with `estimated1RM` (Epley)

**`NutritionTrend` shape** (from `HealthSnapshot`, used by `training-summary`, `progress-report`, and `coach-context`):

```json
{
  "days": [{ "date": "2026-07-10", "dietaryCalories": 2400, "protein": 180, "carbs": 250, "fat": 70 }],
  "loggedDays": 6,
  "averages": { "dietaryCalories": 2380.5, "protein": 175.2, "carbs": 240.1, "fat": 68.4 },
  "macroSplit": { "proteinPct": 29.3, "carbsPct": 40.3, "fatPct": 30.4 }
}
```

- `days[]` includes one entry per calendar day in the window; unlogged days have `null` values (not omitted), so you can see logging gaps.
- `averages` and `macroSplit` are computed only from days that actually have data — `macroSplit` is derived from macro grams (protein/carbs = 4 kcal/g, fat = 9 kcal/g), not from `dietaryCalories`, so it stays internally consistent even if a user logs macros but not a calorie total.
- `macroSplit` is `null` if no macro data exists in the window.

### `GET /api/ai/progress-report`

Richer narrative + analysis block for trend questions.

| Query | Default | Max | Description |
|-------|---------|-----|-------------|
| `weeks` | 12 | 52 | Weeks embedded in `training` summary (capped at 24 inside builder) |

**Response `data` highlights:**

- `kind: "progress-report"`
- `training`: full object from `buildTrainingSummary` (same shape as above, window capped)
- `analysis.volumeTrend`: first-half vs second-half volume in the window, `percentChangeHalfToHalf`
- `analysis.bodyWeight`: `entriesInSample`, `firstWeight`, `lastWeight`, `deltaInSample`, and `series[]` — the full `{date, weight}` list for the sample (up to `min(weeks*2, 60)` entries)
- `analysis.nutrition`: `NutritionTrend` (see above) over `min(weeks*7, 90)` days — daily calories/macros, averages, macro split
- `analysis.personalRecordsLast30Days`, `mostRecentPersonalRecordAt`
- `analysis.uniqueExercisesTouchedLast28Days`
- `topExercisesRolling28d` / `topExercisesRolling56d`

### `GET /api/ai/coach-context`

Single payload for **natural-language Q&A** (body weight, what’s next, in-progress session). No query params.

**Response `data` highlights:**

- `kind: "coach_context"`, `schemaVersion`, `generatedAt`
- `latestBodyWeight`: `{ weight, date, notes }` or `null` if none logged
- `bodyWeightTrend[]`: up to the last 30 logged `{date, weight}` entries (chronological, only actual log days)
- `nutrition`: `NutritionTrend` (see above) for the last 7 days — daily calories/macros, averages, macro split
- `activeWorkouts[]`: in-progress sessions (`id`, `name`, `startedAt`, `exerciseNames[]`)
- `planRotation[]`: per saved plan — `planId`, `planName`, `sessions[]` (each with `lastCompletedAt` when a **completed** workout had that `planSessionId`), `suggestedNext` (rotation heuristic: least-recent or never-done plan day, with `plannedExercises`)
- `primaryPlanId`: most recently updated plan (same order as list) — use as default when the user says “my plan” without naming one
- `recentCompletedWorkouts[]`: last 10 completions
- `llmHints[]`: how to interpret the fields (not user-facing copy)

**“Next workout” rule:** FitTrack has no calendar. `suggestedNext` is **rotation within each plan** based on completed workouts that were started from a plan (linked `planSessionId`). Workouts created ad hoc do not advance that rotation.

### `GET /api/ai/recommendations`

Deterministic, **heuristic** suggestions (no external model).

**Response `data`:**

- `source: "heuristic"`
- `note`: how to combine with an LLM
- `items[]`: `{ id, priority: "info"|"suggest"|"attention", title, detail, basedOn }`

Rules include: days since last workout, volume drop across 8 weeks, recent PR, volume concentration on one lift, active streak.

### Full data export (existing)

| Route | Description |
|-------|-------------|
| `GET /api/export` | Full user payload as JSON (includes workouts, sets, PRs, body weight, settings). |
| `GET /api/export/csv` | Workouts / sets oriented CSV. |

Use exports for backup or offline analysis; use `/api/ai/*` for **structured, privacy-aware** model context.

## Example: Claude / ChatGPT tool flow

1. User authorizes the session (cookie or future API token).
2. For **status / “what’s next” / current weight**, call `GET /api/ai/coach-context` first.
3. Agent calls `GET /api/ai/training-summary?weeks=8` for volume and PR snapshot.
4. Agent calls `GET /api/ai/recommendations` for heuristic checks.
5. For trends and narrative analysis, call `GET /api/ai/progress-report?weeks=16`.
6. Pass `data` JSON into the system prompt as **read-only context**; do not present outputs as medical advice.

## Schema versioning

- `schemaVersion: "1.0"` — bump when removing or renaming fields; keep changelog in this file.
