/**
 * Remote MCP endpoint — MCP Streamable HTTP transport (JSON-RPC 2.0).
 *
 * Configure once in Claude.ai → Settings → Integrations → Add MCP Server:
 *   URL:    https://<your-vercel-app>.vercel.app/api/mcp
 *   Header: Authorization: Bearer ftp_<your_token>
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { resolveUserIdForDataApi, resolveUserIdBySecret } from "@/lib/api-auth";
import {
  buildCoachContext,
  buildTrainingSummary,
  buildProgressReport,
  buildHeuristicRecommendations,
} from "@/features/ai/context";
import { clampWeeks } from "@/features/ai/schemas";

// ── Constants ─────────────────────────────────────────────────────────────────

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "fittrack-pro", version: "1.0.0" };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

const TOOLS = [
  {
    name: "fittrack_coach_context",
    description:
      "Current snapshot: latest body weight, any in-progress workout, suggested next plan session, recent completions. Use this first for 'what should I do today?' or 'how am I doing right now?'",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "fittrack_training_summary",
    description:
      "Weekly training breakdown: volume per week, total working sets, top exercises by volume, recent personal records. Good for 'how has my training looked over the last N weeks?'",
    inputSchema: {
      type: "object",
      properties: {
        weeks: {
          type: "number",
          description: "Number of weeks to analyse (1–24). Defaults to 8.",
          minimum: 1,
          maximum: 24,
        },
      },
    },
  },
  {
    name: "fittrack_progress_report",
    description:
      "Deeper trend analysis: volume first-half vs second-half, body-weight statistics, PR counts, rolling top lifts per exercise. Use for 'am I progressing?', 'where am I plateauing?', 'how has my strength changed?'",
    inputSchema: {
      type: "object",
      properties: {
        weeks: {
          type: "number",
          description: "Number of weeks to analyse (1–52). Defaults to 12.",
          minimum: 1,
          maximum: 52,
        },
      },
    },
  },
  {
    name: "fittrack_recommendations",
    description:
      "Heuristic suggestions derived from your training logs: overreaching signals, volume drops, plateau indicators, recovery hints. Not medical advice.",
    inputSchema: { type: "object", properties: {} },
  },
];

// ── SSE response builder ──────────────────────────────────────────────────────
// MCP Streamable HTTP transport requires text/event-stream responses.

function sseResponse(
  messages: unknown[],
  extraHeaders: Record<string, string> = {}
): Response {
  const body = messages
    .filter((m) => m !== null && m !== undefined)
    .map((m) => `event: message\ndata: ${JSON.stringify(m)}\n\n`)
    .join("");

  return new Response(body || "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────

type JsonRpcId = string | number | null;

function ok(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcErr(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// ── Tool execution ────────────────────────────────────────────────────────────

async function callTool(
  name: string,
  args: Record<string, unknown>,
  userId: string
): Promise<string> {
  switch (name) {
    case "fittrack_coach_context": {
      const data = await buildCoachContext(userId);
      return JSON.stringify({ data, meta: { endpoint: "coach-context" } }, null, 2);
    }
    case "fittrack_training_summary": {
      const weeks = clampWeeks(args.weeks != null ? String(args.weeks) : null, 8, 24);
      const data = await buildTrainingSummary(userId, weeks);
      return JSON.stringify({ data, meta: { endpoint: "training-summary", weeks } }, null, 2);
    }
    case "fittrack_progress_report": {
      const weeks = clampWeeks(args.weeks != null ? String(args.weeks) : null, 12, 52);
      const data = await buildProgressReport(userId, weeks);
      return JSON.stringify({ data, meta: { endpoint: "progress-report", weeks } }, null, 2);
    }
    case "fittrack_recommendations": {
      const items = await buildHeuristicRecommendations(userId);
      return JSON.stringify(
        {
          data: {
            schemaVersion: "1.0",
            kind: "recommendations",
            generatedAt: new Date().toISOString(),
            source: "heuristic",
            note: "Rule-based suggestions from your logs, not medical advice.",
            items,
          },
          meta: { endpoint: "recommendations", count: items.length },
        },
        null,
        2
      );
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Single message handler ────────────────────────────────────────────────────

async function handleMessage(msg: unknown, userId: string): Promise<unknown | null> {
  if (typeof msg !== "object" || msg === null) {
    return rpcErr(null, -32600, "Invalid request");
  }

  const m = msg as Record<string, unknown>;
  const id = (m.id ?? null) as JsonRpcId;
  const method = m.method as string | undefined;
  const params = (m.params ?? {}) as Record<string, unknown>;

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      return null; // notifications have no response

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, { tools: TOOLS });

    case "tools/call": {
      const toolName = params.name as string;
      const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;
      try {
        const text = await callTool(toolName, toolArgs, userId);
        return ok(id, { content: [{ type: "text", text }] });
      } catch (e) {
        return rpcErr(id, -32603, e instanceof Error ? e.message : "Internal error");
      }
    }

    default:
      if (id === null) return null; // unknown notification — ignore
      return rpcErr(id, -32601, `Method not found: ${method ?? "(none)"}`);
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  // Health/discovery — some clients probe this before connecting
  return NextResponse.json(
    {
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
      protocol: PROTOCOL_VERSION,
      transport: "streamable-http",
      tools: TOOLS.map((t) => t.name),
    },
    { headers: CORS_HEADERS }
  );
}

export async function POST(req: NextRequest) {
  // Auth — accept Bearer header OR ?token= query param (for Claude.ai connector UI)
  const tokenParam = req.nextUrl.searchParams.get("token");
  const userId = tokenParam
    ? await resolveUserIdBySecret(tokenParam)
    : await resolveUserIdForDataApi();
  if (!userId) {
    return new Response(
      JSON.stringify(rpcErr(null, -32001, "Unauthorized — set Authorization: Bearer ftp_… header or ?token= query param")),
      { status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return sseResponse([rpcErr(null, -32700, "Parse error: invalid JSON")]);
  }

  const isBatch = Array.isArray(body);
  const messages: unknown[] = isBatch ? (body as unknown[]) : [body];

  // Check if this is an initialize request to attach a session ID
  const isInit = messages.some(
    (m) => typeof m === "object" && m !== null && (m as Record<string, unknown>).method === "initialize"
  );

  const responses = (
    await Promise.all(messages.map((m: unknown) => handleMessage(m, userId)))
  ).filter((r: unknown) => r !== null);

  if (responses.length === 0) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }

  const extraHeaders: Record<string, string> = isInit ? { "Mcp-Session-Id": randomUUID() } : {};
  return sseResponse(isBatch ? responses : responses, extraHeaders);
}
