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
import { prisma } from "@/lib/prisma";
import { getWorkoutsListUncached } from "@/features/workouts/workouts-list-data";
import { getWorkoutDetailData } from "@/features/workouts/workout-detail-data";
import { getExercises } from "@/features/exercises/exercise-data";
import {
  findExerciseVisibleToUser,
  fetchCompletedSetsForExercise,
  computeProgressBySession,
  computeVolumeBySession,
  mapSetsToHistoryRows,
} from "@/features/exercises/history-core";
import { getAllPersonalRecords, getAchievements } from "@/services/personal-records";
import { getDashboardSummary } from "@/features/dashboard/queries";
import { getCardioSummary } from "@/features/health/cardio";
import { getHealthSnapshots } from "@/features/health/health-data";
import { computeRecovery, computeRecoveryHistory } from "@/features/health/recovery";
import {
  applyOverrides,
  computeCardioSchedule,
  computeTrainingSchedule,
  DEFAULT_HORIZON_DAYS,
  getCalendarOverrides,
} from "@/features/calendar/schedule";
import type { CalendarKind } from "@/generated/prisma/client";

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
  {
    name: "fittrack_workouts",
    description:
      "Raw list of logged workouts (not aggregated): id, name, start/end, duration, exercise names. Paginated. Use to find a specific session, then fittrack_workout_detail for its sets.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "1-indexed page. Defaults to 1.", minimum: 1 },
        limit: { type: "number", description: "Rows per page (1–100). Defaults to 20.", minimum: 1, maximum: 100 },
        status: {
          type: "string",
          enum: ["active", "completed"],
          description: "Filter by completion state. Omit for all.",
        },
      },
    },
  },
  {
    name: "fittrack_workout_detail",
    description:
      "One workout in full: every exercise and every set with weight, reps, warmup flag and completion state. Use for 'what exactly did I lift on <date>?'",
    inputSchema: {
      type: "object",
      properties: {
        workoutId: { type: "string", description: "Workout id from fittrack_workouts or fittrack_coach_context." },
      },
      required: ["workoutId"],
    },
  },
  {
    name: "fittrack_exercises",
    description:
      "The exercise catalog: built-in exercises plus this user's custom ones. Use to resolve an exercise name to an id before calling fittrack_exercise_history.",
    inputSchema: {
      type: "object",
      properties: {
        muscleGroup: { type: "string", description: "Exact muscle-group filter." },
        equipment: { type: "string", description: "Exact equipment filter." },
        search: { type: "string", description: "Case-insensitive name substring." },
      },
    },
  },
  {
    name: "fittrack_exercise_history",
    description:
      "Full logged history for one exercise: best set and volume per session over time, plus every individual completed set. Use for 'how has my bench press progressed?'",
    inputSchema: {
      type: "object",
      properties: {
        exerciseId: { type: "string", description: "Exercise id from fittrack_exercises." },
      },
      required: ["exerciseId"],
    },
  },
  {
    name: "fittrack_personal_records",
    description:
      "Every personal record ever logged (not just the recent rollup), with estimated 1RM, plus unlocked achievements (workout/PR milestones, streaks).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "fittrack_cardio_history",
    description:
      "Every cardio session imported from Apple Health (running, cycling, elliptical, walking, …): per-week points, per-type breakdown, outdoor vs indoor totals.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "fittrack_body_measurements",
    description:
      "Logged body-circumference measurements over time: neck, chest, arms, waist, hips, thighs. All fields nullable — only what was actually logged that day.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "fittrack_health",
    description:
      "Daily health metrics from Apple Health: STEPS, sleep, resting and average heart rate, HRV, respiratory rate, wrist temperature, VO2max, exercise minutes, stand hours, and micronutrients — plus the current Recovery Score and its history. Use this for step counts and any sleep/heart/recovery question.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Window size in days (1–180). Defaults to 30.", minimum: 1, maximum: 180 },
      },
    },
  },
  {
    name: "fittrack_calendar",
    description:
      "Upcoming scheduled training and cardio sessions from the computed calendar, with manual reschedules/skips already applied.",
    inputSchema: {
      type: "object",
      properties: {
        today: {
          type: "string",
          description:
            "The user's local date as YYYY-MM-DD. Pass this explicitly — the server has no timezone context and falls back to UTC.",
        },
        horizonDays: {
          type: "number",
          description: "Days ahead to compute (1–56). Defaults to 28.",
          minimum: 1,
          maximum: 56,
        },
      },
    },
  },
  {
    name: "fittrack_plans",
    description:
      "Every saved training plan with its full structure: sessions in order, and the planned exercises (with target sets) per session.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "fittrack_settings",
    description:
      "Non-sensitive user preferences: weight unit, locale, theme, default rest timer, and the training/cardio calendar-sync configuration. Never returns tokens or passwords.",
    inputSchema: { type: "object", properties: {} },
  },
];

// ── Response helpers ──────────────────────────────────────────────────────────

/** Single JSON-RPC response — application/json (spec §6.1). */
function jsonResponse(
  payload: unknown,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

/** Batch or streaming — text/event-stream SSE (spec §6.2). */
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

/** Same `{ schemaVersion, kind, generatedAt }` preamble the /api/ai/* routes
 *  put on every payload, so a tool result and its HTTP equivalent are
 *  byte-identical in shape. */
function envelope(kind: string) {
  return { schemaVersion: "1.0", kind, generatedAt: new Date().toISOString() };
}

/** MCP tool results are plain text — pretty-printed so the model reads
 *  structure rather than one long line. */
function json(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

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
    case "fittrack_workouts": {
      const page = Math.max(1, Number(args.page ?? 1) || 1);
      const limit = Math.min(100, Math.max(1, Number(args.limit ?? 20) || 20));
      const rawStatus = args.status;
      const status = rawStatus === "active" || rawStatus === "completed" ? rawStatus : null;
      const { items, total } = await getWorkoutsListUncached(userId, page, limit, status);
      return json({
        data: { ...envelope("workouts"), workouts: items },
        meta: { endpoint: "workouts", page, limit, total, status },
      });
    }
    case "fittrack_workout_detail": {
      const workoutId = String(args.workoutId ?? "");
      if (!workoutId) throw new Error("Missing workoutId");
      const workout = await getWorkoutDetailData(userId, workoutId);
      if (!workout) throw new Error(`Workout not found: ${workoutId}`);
      return json({
        data: { ...envelope("workout-detail"), workout },
        meta: { endpoint: "workouts/:id" },
      });
    }
    case "fittrack_exercises": {
      const exercises = await getExercises(userId, {
        muscleGroup: args.muscleGroup != null ? String(args.muscleGroup) : null,
        equipment: args.equipment != null ? String(args.equipment) : null,
        search: args.search != null ? String(args.search) : null,
      });
      return json({
        data: { ...envelope("exercises"), exercises },
        meta: { endpoint: "exercises", count: exercises.length },
      });
    }
    case "fittrack_exercise_history": {
      const exerciseId = String(args.exerciseId ?? "");
      if (!exerciseId) throw new Error("Missing exerciseId");
      const exercise = await findExerciseVisibleToUser(exerciseId, userId);
      if (!exercise) throw new Error(`Exercise not found: ${exerciseId}`);
      const sets = await fetchCompletedSetsForExercise(exerciseId, userId);
      return json({
        data: {
          ...envelope("exercise-history"),
          exercise,
          progressBySession: computeProgressBySession(sets),
          volumeBySession: computeVolumeBySession(sets),
          sets: mapSetsToHistoryRows(sets),
        },
        meta: { endpoint: "exercise-history", exerciseId, setCount: sets.length },
      });
    }
    case "fittrack_personal_records": {
      const [records, summary] = await Promise.all([
        getAllPersonalRecords(userId),
        getDashboardSummary(userId),
      ]);
      const achievements = await getAchievements(userId, summary.workoutStreakDays);
      return json({
        data: { ...envelope("personal-records"), records, achievements },
        meta: { endpoint: "personal-records", count: records.length },
      });
    }
    case "fittrack_cardio_history": {
      const summary = await getCardioSummary(userId);
      return json({
        data: { ...envelope("cardio-history"), ...summary },
        meta: { endpoint: "cardio-history" },
      });
    }
    case "fittrack_body_measurements": {
      const entries = await prisma.bodyMeasurement.findMany({
        where: { userId },
        orderBy: { date: "asc" },
      });
      return json({
        data: {
          ...envelope("body-measurements"),
          entries: entries.map((e) => ({
            date: e.date.toISOString().slice(0, 10),
            neck: e.neck,
            chest: e.chest,
            leftArm: e.leftArm,
            rightArm: e.rightArm,
            waist: e.waist,
            hips: e.hips,
            leftThigh: e.leftThigh,
            rightThigh: e.rightThigh,
            notes: e.notes,
          })),
        },
        meta: { endpoint: "body-measurements", count: entries.length },
      });
    }
    case "fittrack_health": {
      const days = clampWeeks(args.days != null ? String(args.days) : null, 30, 180);
      const [snapshots, recovery, recoveryHistory] = await Promise.all([
        getHealthSnapshots(userId, days),
        computeRecovery(userId),
        computeRecoveryHistory(userId, days),
      ]);
      return json({
        data: { ...envelope("health"), snapshots, recovery, recoveryHistory },
        meta: { endpoint: "health", days, snapshotCount: snapshots.length },
      });
    }
    case "fittrack_calendar": {
      const today =
        args.today != null && /^\d{4}-\d{2}-\d{2}$/.test(String(args.today))
          ? String(args.today)
          : new Date().toISOString().slice(0, 10);
      const rawHorizon = Number(args.horizonDays ?? DEFAULT_HORIZON_DAYS);
      const horizonDays = Number.isFinite(rawHorizon)
        ? Math.min(56, Math.max(1, Math.trunc(rawHorizon)))
        : DEFAULT_HORIZON_DAYS;

      const scheduled = async (kind: CalendarKind) => {
        const entries =
          kind === "TRAINING"
            ? await computeTrainingSchedule(userId, today, horizonDays)
            : await computeCardioSchedule(userId, today, horizonDays);
        return applyOverrides(entries, await getCalendarOverrides(userId, kind, entries));
      };

      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { calendarSyncEnabled: true, cardioSyncEnabled: true },
      });
      const trainingEnabled = settings?.calendarSyncEnabled ?? false;
      const cardioEnabled = settings?.cardioSyncEnabled ?? false;

      return json({
        data: {
          ...envelope("calendar"),
          horizonDays,
          training: { enabled: trainingEnabled, events: trainingEnabled ? await scheduled("TRAINING") : [] },
          cardio: { enabled: cardioEnabled, events: cardioEnabled ? await scheduled("CARDIO") : [] },
        },
        meta: { endpoint: "calendar", today, horizonDays },
      });
    }
    case "fittrack_plans": {
      const plans = await prisma.workoutPlan.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        include: {
          sessions: {
            orderBy: { order: "asc" },
            include: {
              exercises: {
                orderBy: { order: "asc" },
                include: {
                  exercise: { select: { id: true, name: true, muscleGroup: true, equipment: true } },
                },
              },
            },
          },
        },
      });
      return json({
        data: { ...envelope("plans"), plans },
        meta: { endpoint: "plans", count: plans.length },
      });
    }
    case "fittrack_settings": {
      // Read-only: never creates a UserSettings row (unlike GET /api/settings),
      // and never exposes tokens or password material.
      const settings = await prisma.userSettings.findUnique({ where: { userId } });
      return json({
        data: {
          ...envelope("settings"),
          locale: settings?.locale ?? null,
          weightUnit: settings?.weightUnit ?? null,
          theme: settings?.theme ?? null,
          restTimerDefault: settings?.restTimerDefault ?? null,
          calendarSyncEnabled: settings?.calendarSyncEnabled ?? false,
          trainingWeekdays: settings?.trainingWeekdays ?? [],
          trainingTimeMinutes: settings?.trainingTimeMinutes ?? null,
          trainingDurationMinutes: settings?.trainingDurationMinutes ?? null,
          cardioSyncEnabled: settings?.cardioSyncEnabled ?? false,
          cardioWeekdays: settings?.cardioWeekdays ?? [],
          cardioTimeMinutes: settings?.cardioTimeMinutes ?? null,
          cardioDurationMinutes: settings?.cardioDurationMinutes ?? null,
          cardioLabel: settings?.cardioLabel ?? null,
        },
        meta: { endpoint: "settings" },
      });
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

export async function GET(req: NextRequest) {
  // MCP spec: GET is for server-to-client SSE streams.
  // We don't need server-initiated messages, so return 405 per spec.
  // Exception: if a browser / health-check hits us without Accept: text/event-stream,
  // return a friendly JSON discovery response instead.
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/event-stream")) {
    return new Response(null, { status: 405, headers: CORS_HEADERS });
  }
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
    const base = `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    return new Response(
      JSON.stringify(rpcErr(null, -32001, "Unauthorized")),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "WWW-Authenticate": `Bearer realm="mcp", resource_metadata="${base}/.well-known/oauth-protected-resource"`,
          ...CORS_HEADERS,
        },
      }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(rpcErr(null, -32700, "Parse error: invalid JSON"));
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

  // Single request → application/json; batch → text/event-stream SSE
  if (!isBatch && responses.length === 1) {
    return jsonResponse(responses[0], extraHeaders);
  }
  return sseResponse(responses, extraHeaders);
}
