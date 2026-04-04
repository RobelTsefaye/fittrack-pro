/**
 * Remote MCP endpoint — MCP Streamable HTTP transport (JSON-RPC 2.0).
 *
 * Configure once in Claude.ai → Settings → Integrations → Add MCP Server:
 *   URL:    https://<your-vercel-app>.vercel.app/api/mcp
 *   Header: Authorization: Bearer ftp_<your_token>
 *
 * After that, Claude can call fittrack_* tools from any device (phone, web, desktop).
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import {
  buildCoachContext,
  buildTrainingSummary,
  buildProgressReport,
  buildHeuristicRecommendations,
} from "@/features/ai/context";
import { clampWeeks } from "@/features/ai/schemas";

// ── MCP metadata ─────────────────────────────────────────────────────────────

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "fittrack-pro", version: "1.0.0" };

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

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────

type JsonRpcId = string | number | null;

function ok(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function err(id: JsonRpcId, code: number, message: string) {
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

// ── Message handler ───────────────────────────────────────────────────────────

async function handleMessage(msg: unknown, userId: string): Promise<unknown | null> {
  if (typeof msg !== "object" || msg === null) {
    return err(null, -32600, "Invalid request");
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

    // Notifications have no id and expect no response
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

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
        return err(id, -32603, e instanceof Error ? e.message : "Internal error");
      }
    }

    default:
      // Notifications (no id) are silently ignored; requests get an error
      if (id === null) return null;
      return err(id, -32601, `Method not found: ${method ?? "(none)"}`);
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth — Bearer token or active session
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json(
      err(null, -32001, "Unauthorized — provide a valid Bearer token (Authorization: Bearer ftp_…)"),
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(err(null, -32700, "Parse error: invalid JSON"), { status: 400 });
  }

  const isBatch = Array.isArray(body);
  const messages: unknown[] = isBatch ? (body as unknown[]) : [body];

  const responses = (
    await Promise.all(messages.map((m: unknown) => handleMessage(m, userId)))
  ).filter((r: unknown) => r !== null);

  // Batch → array response; single → object; all notifications → 202 No Content
  if (responses.length === 0) return new NextResponse(null, { status: 202 });
  return NextResponse.json(isBatch ? responses : responses[0]);
}

// Some MCP clients do a GET to check the endpoint is alive
export async function GET() {
  return NextResponse.json({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    protocol: PROTOCOL_VERSION,
    transport: "streamable-http",
    tools: TOOLS.map((t) => t.name),
  });
}
