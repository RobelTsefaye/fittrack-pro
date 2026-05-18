import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveUserIdForDataApi } from "@/lib/api-auth";

// All fields optional — Shortcut sends only what Apple Health has available
const snapshotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),

  sleepDuration: z.number().min(0).max(24).optional().nullable(),
  sleepBedtime: z.string().max(10).optional().nullable(),
  sleepWakeTime: z.string().max(10).optional().nullable(),
  sleepDeepMinutes: z.number().int().min(0).optional().nullable(),
  sleepRemMinutes: z.number().int().min(0).optional().nullable(),
  sleepQuality: z.number().int().min(0).max(100).optional().nullable(),

  restingHeartRate: z.number().int().min(20).max(300).optional().nullable(),
  heartRateAvg: z.number().int().min(20).max(300).optional().nullable(),
  hrv: z.number().min(0).max(500).optional().nullable(),

  steps: z.number().int().min(0).optional().nullable(),
  activeCalories: z.number().min(0).optional().nullable(),
  exerciseMinutes: z.number().int().min(0).optional().nullable(),
  standHours: z.number().int().min(0).max(24).optional().nullable(),

  vo2Max: z.number().min(0).max(100).optional().nullable(),

  calories: z.number().min(0).optional().nullable(),
  protein: z.number().min(0).optional().nullable(),
  carbs: z.number().min(0).optional().nullable(),
  fat: z.number().min(0).optional().nullable(),
  water: z.number().min(0).optional().nullable(),

  mindfulMinutes: z.number().int().min(0).optional().nullable(),
});

// GET /api/health-data?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=90
export async function GET(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "90", 10), 365);

  const data = await prisma.healthSnapshot.findMany({
    where: {
      userId,
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    orderBy: { date: "asc" },
    take: limit,
  });

  return NextResponse.json({ data });
}

// Map Health Auto Export metric names to our schema fields.
// HAE uses lowercase snake_case but spellings differ across versions —
// include all known aliases for robustness.
const HAE_METRIC_MAP: Record<string, keyof typeof snapshotSchema.shape> = {
  step_count: "steps",
  steps: "steps",

  resting_heart_rate: "restingHeartRate",
  walking_heart_rate_average: "heartRateAvg",
  heart_rate: "heartRateAvg",

  heart_rate_variability: "hrv",
  heart_rate_variability_sdnn: "hrv",
  hrv: "hrv",

  active_energy: "activeCalories",
  active_energy_burned: "activeCalories",
  basal_energy_burned: "calories",

  apple_exercise_time: "exerciseMinutes",
  exercise_time: "exerciseMinutes",
  apple_stand_hour: "standHours",
  apple_stand_time: "standHours",

  vo2_max: "vo2Max",

  dietary_water: "water",
  water: "water",

  dietary_energy: "calories",
  dietary_energy_consumed: "calories",
  protein: "protein",
  dietary_protein: "protein",
  carbohydrates: "carbs",
  dietary_carbohydrates: "carbs",
  total_fat: "fat",
  dietary_fat_total: "fat",

  mindful_minutes: "mindfulMinutes",
  mindful_session: "mindfulMinutes",
};

type HAEEntry = { date?: string; qty?: number; Avg?: number; avg?: number; asleep?: number; value?: number; sleepStart?: string; sleepEnd?: string };
type HAEMetric = { name: string; units?: string; data?: HAEEntry[] };
type HAEPayload = { data?: { metrics?: HAEMetric[] } };

function isHAEPayload(body: unknown): body is HAEPayload {
  return !!body && typeof body === "object" && "data" in body
    && !!(body as HAEPayload).data?.metrics
    && Array.isArray((body as HAEPayload).data!.metrics);
}

function extractDateKey(d?: string): string | null {
  if (!d) return null;
  const m = d.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function entryValue(e: HAEEntry): number | null {
  if (typeof e.qty === "number") return e.qty;
  if (typeof e.Avg === "number") return e.Avg;
  if (typeof e.avg === "number") return e.avg;
  if (typeof e.value === "number") return e.value;
  if (typeof e.asleep === "number") return e.asleep;
  return null;
}

// Transform HAE payload → array of { date, ...fields } records
function transformHAE(payload: HAEPayload): Array<Record<string, unknown>> {
  const byDate: Map<string, Record<string, unknown>> = new Map();

  for (const metric of payload.data?.metrics ?? []) {
    const field = HAE_METRIC_MAP[metric.name];
    const isSleep = metric.name === "sleep_analysis";
    if (!field && !isSleep) continue;

    for (const entry of metric.data ?? []) {
      const dateKey = extractDateKey(entry.sleepEnd ?? entry.date);
      if (!dateKey) continue;
      const rec = byDate.get(dateKey) ?? { date: dateKey };

      if (isSleep) {
        if (typeof entry.asleep === "number") rec.sleepDuration = entry.asleep;
        if (entry.sleepStart) rec.sleepBedtime = entry.sleepStart.slice(11, 16);
        if (entry.sleepEnd) rec.sleepWakeTime = entry.sleepEnd.slice(11, 16);
      } else if (field) {
        const v = entryValue(entry);
        if (v != null) rec[field] = v;
      }

      byDate.set(dateKey, rec);
    }
  }

  return Array.from(byDate.values());
}

// POST /api/health-data — upsert (iOS Shortcut, Health Auto Export, or web form)
export async function POST(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Detect Health Auto Export format and transform
  const records = isHAEPayload(body) ? transformHAE(body) : [body];

  const results = [];
  for (const record of records) {
    const parsed = snapshotSchema.safeParse(record);
    if (!parsed.success) continue;

    const { date: dateStr, ...fields } = parsed.data;
    const date = dateStr
      ? new Date(dateStr + "T00:00:00.000Z")
      : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");

    const data = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined)
    );

    if (Object.keys(data).length === 0) continue;

    const snapshot = await prisma.healthSnapshot.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, ...data },
      update: data,
    });
    results.push(snapshot);
  }

  return NextResponse.json({ data: results, count: results.length });
}

// DELETE /api/health-data?date=YYYY-MM-DD
export async function DELETE(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = new URL(req.url).searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  await prisma.healthSnapshot.deleteMany({
    where: { userId, date: new Date(date + "T00:00:00.000Z") },
  });

  return NextResponse.json({ success: true });
}
