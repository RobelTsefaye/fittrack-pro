#!/usr/bin/env node
/**
 * Claude / AI integration demo: fetch coach-context with a personal API token.
 *
 * Usage:
 *   FITTRACK_BASE_URL=http://localhost:3000 FITTRACK_API_TOKEN=ftp_… node scripts/demo-ai-fetch.mjs
 *
 * Same env vars as mcp/fittrack-mcp. Create the token in FitTrack → Settings → API token.
 */

const base = (process.env.FITTRACK_BASE_URL ?? "").replace(/\/$/, "");
const token = process.env.FITTRACK_API_TOKEN ?? "";

if (!base || !token) {
  console.error(
    "Set FITTRACK_BASE_URL and FITTRACK_API_TOKEN (see project-docs/ai-api.md)."
  );
  process.exit(1);
}

const url = `${base}/api/ai/coach-context`;
const res = await fetch(url, {
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  },
});

const text = await res.text();
if (!res.ok) {
  console.error(res.status, text.slice(0, 500));
  process.exit(1);
}

try {
  const data = JSON.parse(text);
  console.log(JSON.stringify(data, null, 2));
} catch {
  console.log(text);
}
