#!/usr/bin/env node
/**
 * MCP bridge: Claude Desktop (or any MCP client) ↔ FitTrack Pro HTTP API.
 * Configure once in Claude Desktop with FITTRACK_BASE_URL + FITTRACK_API_TOKEN.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const token =
  process.env.FITTRACK_API_TOKEN?.trim() ||
  process.env.FITTRACK_TOKEN?.trim() ||
  "";

let base =
  process.env.FITTRACK_BASE_URL?.replace(/\/$/, "").trim() ||
  process.env.FITTRACK_URL?.replace(/\/$/, "").trim() ||
  "";

if (!base && token) {
  base = "http://localhost:3000";
  console.error(
    "FitTrack MCP: FITTRACK_BASE_URL not set — using http://localhost:3000 (set FITTRACK_BASE_URL for production / tunnel)."
  );
}

if (!token) {
  console.error(
    "FitTrack MCP: set FITTRACK_API_TOKEN or FITTRACK_TOKEN (create in FitTrack Settings → API token)."
  );
  process.exit(1);
}

if (!base) {
  console.error("FitTrack MCP: set FITTRACK_BASE_URL (e.g. http://localhost:3000).");
  process.exit(1);
}

async function fittrackGet(pathWithQuery: string): Promise<string> {
  const url = `${base}${pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    const hint =
      res.status === 401
        ? "HTTP 401: The Bearer token was rejected or missing on the request. This is NOT Claude account linking. Fix: (1) In FitTrack → Settings → API token, create a token or copy an existing one. (2) In claude_desktop_config.json under this MCP server's env, set FITTRACK_API_TOKEN (or FITTRACK_TOKEN) to that exact secret. (3) Set FITTRACK_BASE_URL to your running app (e.g. http://localhost:3000 — app must be running). (4) Restart Claude Desktop after edits. Revoke old tokens if unsure."
        : res.status === 404
          ? "HTTP 404: Wrong FITTRACK_BASE_URL or path (not the FitTrack Next.js app)."
          : undefined;
    return JSON.stringify(
      {
        ok: false,
        status: res.status,
        message: text.slice(0, 2000),
        ...(hint ? { hint } : {}),
      },
      null,
      2
    );
  }
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

const server = new McpServer({
  name: "fittrack-pro",
  version: "1.0.0",
});

server.tool(
  "fittrack_coach_context",
  "Snapshot for coaching: latest body weight, in-progress workouts, plan-based suggested next session, recent completions. Use for current weight, what to do next, mid-workout state.",
  async () => ({
    content: [{ type: "text", text: await fittrackGet("/api/ai/coach-context") }],
  })
);

server.tool(
  "fittrack_training_summary",
  "Weekly volume, working sets, top exercises by volume, recent PRs over a window.",
  {
    weeks: z
      .number()
      .int()
      .min(1)
      .max(24)
      .optional()
      .describe("Weeks of Mon-start history (default 8 on server if omitted)"),
  },
  async ({ weeks }) => {
    const w = weeks ?? 8;
    return {
      content: [{ type: "text", text: await fittrackGet(`/api/ai/training-summary?weeks=${w}`) }],
    };
  }
);

server.tool(
  "fittrack_progress_report",
  "Richer trends: volume half-to-half, body-weight sample stats, PR counts, rolling top lifts.",
  {
    weeks: z
      .number()
      .int()
      .min(1)
      .max(52)
      .optional()
      .describe("Weeks for analysis (default 12 on server if omitted)"),
  },
  async ({ weeks }) => {
    const w = weeks ?? 12;
    return {
      content: [{ type: "text", text: await fittrackGet(`/api/ai/progress-report?weeks=${w}`) }],
    };
  }
);

server.tool(
  "fittrack_recommendations",
  "Heuristic training suggestions from your logs (rest, volume drop, PRs, etc.). Not medical advice.",
  async () => ({
    content: [{ type: "text", text: await fittrackGet("/api/ai/recommendations") }],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
