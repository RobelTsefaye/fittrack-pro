# FitTrack Pro — Claude Integration

Two ways to connect Claude to your training data:

| | **Remote (claude.ai)** | **Local (Claude Desktop)** |
|---|---|---|
| Works on phone | ✅ | ❌ |
| Works on PC | ✅ | ✅ |
| Extra hosting | none — uses the deployed FitTrack app | none — runs on your machine |
| Setup effort | 2 min | 5 min |

---

## Option A — Remote MCP (phone + PC + web) ← recommended

This uses the `/api/mcp` endpoint built into the deployed app (currently self-hosted on the Mac behind the Tailscale
Funnel, see `project-docs/deployment.md`). No extra hosting — it runs alongside the app, so it is only reachable while
the Mac is online.

### 1. Get your API token
In FitTrack → **Settings → API token** → create a token → copy it.

### 2. Add the integration in Claude.ai

1. Open [claude.ai](https://claude.ai) → **Settings → Integrations**
2. Click **Add custom integration** (or "Add MCP Server")
3. Fill in:
   - **Name:** FitTrack Pro
   - **URL:** `<APP_URL>/api/mcp`
     *(replace `<APP_URL>` with the address the app is served from, e.g. the Tailscale Funnel address; on Vercel `https://<your-app>.vercel.app`)*
   - **Authentication:** Custom header
     - Header name: `Authorization`
     - Header value: `Bearer ftp_your_token_here`
4. Save → Claude discovers the 15 tools automatically (table below)

### 3. Use from any device

The integration is stored in your Claude account — it works everywhere:
- Claude.ai in any browser (PC, phone, tablet)
- Claude iOS / Android app (same account)

### Example prompts
- *"Analyse my training progress over the last 6 weeks"*
- *"Which exercises am I progressing best on?"*
- *"Am I overreaching? Give me recommendations."*
- *"How has my body weight changed recently?"*
- *"What should I train next based on my plan?"*

---

## Option B — Local stdio MCP (Claude Desktop only)

Runs as a child process on your Mac. Only works when Claude Desktop is open on that machine.

### 1. Build

```bash
cd mcp/fittrack-mcp
npm install
npm run build
```

### 2. Configure Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fittrack-pro": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/fittrack-pro/mcp/fittrack-mcp/dist/index.js"],
      "env": {
        "FITTRACK_BASE_URL": "<APP_URL>",
        "FITTRACK_API_TOKEN": "ftp_paste_your_token_here"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

---

## Tools (same in both options)

| Tool | What it returns |
|------|----------------|
| `fittrack_coach_context` | Current body weight, active workout, suggested next session, recent completions |
| `fittrack_training_summary` | Weekly volume, sets, top exercises, recent PRs (1–24 weeks) |
| `fittrack_progress_report` | Volume trends, body-weight stats, PR counts, plateau signals (1–52 weeks) |
| `fittrack_recommendations` | Heuristic suggestions from your logs |
| `fittrack_workouts` | Raw workout list, paginated (id, name, dates, duration, exercise names) |
| `fittrack_workout_detail` | One workout in full: every exercise/set with weight, reps, warmup, completion |
| `fittrack_exercises` | The exercise catalog (built-in + your custom exercises), filterable |
| `fittrack_exercise_history` | Full logged history for one exercise: progress/volume per session, every set |
| `fittrack_personal_records` | Every PR ever logged, plus unlocked achievements |
| `fittrack_cardio_history` | Every HealthKit-imported cardio session, weekly points, type breakdown |
| `fittrack_body_measurements` | Logged body-circumference measurements over time |
| `fittrack_health` | Sleep, HR/HRV, respiratory rate, wrist temp, VO2max, activity, micronutrients, Recovery Score |
| `fittrack_calendar` | Upcoming training/cardio sessions from the computed schedule |
| `fittrack_plans` | Every saved training plan with its full session/exercise structure |
| `fittrack_settings` | Non-sensitive preferences: units, theme, rest timer, calendar-sync config |

---

## Troubleshooting

**401 Unauthorized**
- Token must match exactly what's in FitTrack → Settings → API token
- Remote: verify the header value in Claude.ai settings (no trailing spaces)
- Local: verify `FITTRACK_API_TOKEN` in `claude_desktop_config.json`, restart Claude Desktop

**Tools not appearing in Claude**
- Remote: remove and re-add the integration in Claude.ai settings
- Local: verify the `dist/index.js` path is absolute and `npm run build` succeeded

---

## Security

- A token has **full account access**, not read-only: it works on every API route (read, write, delete, export) and can create further tokens (XR-SEC-02). Revoke tokens in Settings if a device is lost; if a token leaked, delete all tokens of the account. Rotation steps: `project-docs/deployment.md`.
- The token sits in plain text in `claude_desktop_config.json` (local option); keep that file out of backups and repos.
- Do not commit files containing your token.
