# FitTrack Pro — Claude Integration

Two ways to connect Claude to your training data:

| | **Remote (claude.ai)** | **Local (Claude Desktop)** |
|---|---|---|
| Works on phone | ✅ | ❌ |
| Works on PC | ✅ | ✅ |
| Extra hosting | none — uses your Vercel app | none — runs on your machine |
| Setup effort | 2 min | 5 min |

---

## Option A — Remote MCP (phone + PC + web) ← recommended

This uses the `/api/mcp` endpoint built into your deployed Vercel app.
No extra hosting, no extra cost — it runs alongside your existing app.

### 1. Get your API token
In FitTrack → **Settings → API token** → create a token → copy it.

### 2. Add the integration in Claude.ai

1. Open [claude.ai](https://claude.ai) → **Settings → Integrations**
2. Click **Add custom integration** (or "Add MCP Server")
3. Fill in:
   - **Name:** FitTrack Pro
   - **URL:** `https://<your-app>.vercel.app/api/mcp`
     *(replace `<your-app>` with your actual Vercel subdomain)*
   - **Authentication:** Custom header
     - Header name: `Authorization`
     - Header value: `Bearer ftp_your_token_here`
4. Save → Claude discovers the 4 tools automatically

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
      "args": ["/ABSOLUTE/PATH/TO/FitnessApp/mcp/fittrack-mcp/dist/index.js"],
      "env": {
        "FITTRACK_BASE_URL": "https://<your-app>.vercel.app",
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

- Anyone with the token can read your AI + export endpoints. Revoke tokens in Settings if a device is lost.
- Do not commit files containing your token.
