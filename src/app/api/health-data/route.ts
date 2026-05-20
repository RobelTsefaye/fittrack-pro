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

  // Energy expenditure (Apple Health "basal")
  calories: z.number().min(0).optional().nullable(),

  // Nutrition intake (what you ate / drank)
  dietaryCalories: z.number().min(0).optional().nullable(),
  protein: z.number().min(0).optional().nullable(),
  carbs: z.number().min(0).optional().nullable(),
  fat: z.number().min(0).optional().nullable(),
  fiber: z.number().min(0).optional().nullable(),
  sugar: z.number().min(0).optional().nullable(),
  sodium: z.number().min(0).optional().nullable(),
  caffeine: z.number().min(0).optional().nullable(),
  water: z.number().min(0).optional().nullable(),

  // Micronutrients
  vitaminD: z.number().min(0).optional().nullable(),
  vitaminC: z.number().min(0).optional().nullable(),
  calcium: z.number().min(0).optional().nullable(),
  iron: z.number().min(0).optional().nullable(),
  potassium: z.number().min(0).optional().nullable(),
  magnesium: z.number().min(0).optional().nullable(),

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

  vo2_max: "vo2Max",

  dietary_water: "water",
  water: "water",

  // Intake — these go to dietaryCalories, NOT the basal "calories" field
  dietary_energy: "dietaryCalories",
  dietary_energy_consumed: "dietaryCalories",
  dietary_calories: "dietaryCalories",

  // Macros
  protein: "protein",
  dietary_protein: "protein",
  carbohydrates: "carbs",
  dietary_carbohydrates: "carbs",
  total_fat: "fat",
  dietary_fat_total: "fat",
  fiber: "fiber",
  dietary_fiber: "fiber",
  sugar: "sugar",
  dietary_sugar: "sugar",
  sodium: "sodium",
  dietary_sodium: "sodium",
  caffeine: "caffeine",
  dietary_caffeine: "caffeine",

  // Micros — Apple Health units: D=mcg, C=mg, Ca/Fe/K/Mg=mg
  vitamin_d: "vitaminD",
  dietary_vitamin_d: "vitaminD",
  vitamin_c: "vitaminC",
  dietary_vitamin_c: "vitaminC",
  calcium: "calcium",
  dietary_calcium: "calcium",
  iron: "iron",
  dietary_iron: "iron",
  potassium: "potassium",
  dietary_potassium: "potassium",
  magnesium: "magnesium",
  dietary_magnesium: "magnesium",

  mindful_minutes: "mindfulMinutes",
  mindful_session: "mindfulMinutes",
};

type HAEEntry = {
  date?: string;
  qty?: number;
  Avg?: number;
  avg?: number;
  value?: number;
  // Sleep-specific fields (all in hours)
  asleep?: number;
  inBed?: number;
  awake?: number;
  deep?: number;
  core?: number;
  rem?: number;
  sleepStart?: string;
  sleepEnd?: string;
};
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

// Fields that store kcal in our schema. When HAE reports them in kJ
// (common in EU/metric locales — e.g. de_FR), convert: 1 kcal = 4.184 kJ.
const KCAL_FIELDS = new Set<string>([
  "calories", "activeCalories", "dietaryCalories",
]);

/**
 * Normalize an energy value to kcal. HAE includes a `units` string on each
 * metric — "kcal", "Cal", "kJ", "kj". Anything kJ-shaped → divide by 4.184.
 */
function normalizeEnergyValue(value: number, units: string | undefined): number {
  if (!units) return value;
  const u = units.toLowerCase();
  // kJ but NOT kcal (kcal also contains "k")
  if (u === "kj" || u === "kilojoule" || u === "kilojoules") {
    return value / 4.184;
  }
  return value;
}

// Fields where multiple entries within the same day should be summed (cumulative totals).
// All other numeric fields are averaged (instantaneous measurements like heart rate, VO2 max).
const SUM_FIELDS = new Set<string>([
  "steps", "activeCalories", "calories", "exerciseMinutes",
  "standHours", "mindfulMinutes", "sleepDuration",
  // Nutrition intake: each food entry adds up across the day
  "dietaryCalories", "protein", "carbs", "fat", "fiber", "sugar",
  "sodium", "caffeine", "water",
  "vitaminD", "vitaminC", "calcium", "iron", "potassium", "magnesium",
]);

// Transform HAE payload → array of { date, ...fields } records.
// HAE often sends multiple hourly entries per day; aggregate them correctly
// (sum cumulative metrics like steps, average instantaneous metrics like HR).
function transformHAE(payload: HAEPayload): Array<Record<string, unknown>> {
  const byDate: Map<string, { sums: Record<string, number>; counts: Record<string, number>; meta: Record<string, unknown> }> = new Map();

  for (const metric of payload.data?.metrics ?? []) {
    const field = HAE_METRIC_MAP[metric.name];
    const isSleep = metric.name === "sleep_analysis";
    if (!field && !isSleep) continue;

    for (const entry of metric.data ?? []) {
      const dateKey = extractDateKey(entry.sleepEnd ?? entry.date);
      if (!dateKey) continue;
      const bucket = byDate.get(dateKey) ?? { sums: {}, counts: {}, meta: {} };

      if (isSleep) {
        // Prefer ACTUAL sleep time (excludes wake periods) over time-in-bed.
        // Priority order (most → least accurate):
        //   1. Sum of sleep stages (deep + core + REM) — direct measurement of asleep time
        //   2. asleep field (HAE-provided total asleep time)
        //   3. inBed minus awake time
        //   4. asleep alone (older HAE versions may have it without awake)
        //   5. inBed alone (overestimates by including wake periods)
        //   6. sleepEnd - sleepStart (worst — pure time-in-bed)
        let hours: number | null = null;
        const stageSum =
          (entry.deep ?? 0) + (entry.core ?? 0) + (entry.rem ?? 0);
        if (stageSum > 0) {
          hours = stageSum;
        } else if (
          typeof entry.asleep === "number" && entry.asleep > 0 &&
          typeof entry.awake === "number" && entry.awake >= 0
        ) {
          // If asleep already excludes awake, this is the right value;
          // some HAE versions report asleep == inBed, in which case we still want
          // to subtract awake. Use the smaller of (asleep, inBed - awake) when both available.
          hours = entry.asleep;
          if (typeof entry.inBed === "number" && entry.inBed > 0) {
            hours = Math.min(hours, entry.inBed - entry.awake);
          }
        } else if (typeof entry.asleep === "number" && entry.asleep > 0) {
          hours = entry.asleep;
        } else if (typeof entry.inBed === "number" && entry.inBed > 0) {
          hours = entry.inBed - (entry.awake ?? 0);
        } else if (entry.sleepStart && entry.sleepEnd) {
          const ms = new Date(entry.sleepEnd).getTime() - new Date(entry.sleepStart).getTime();
          if (ms > 0) hours = (ms / 3_600_000) - (entry.awake ?? 0);
        }

        if (hours != null && hours > 0) {
          // Take MAX (longest sleep session of the day), not sum, because
          // HAE may emit multiple entries per day (naps, brief wake/sleep cycles).
          const existing = bucket.sums.sleepDuration ?? 0;
          bucket.sums.sleepDuration = Math.max(existing, hours);
          bucket.counts.sleepDuration = 1;
          if (hours > existing) {
            if (entry.sleepStart) bucket.meta.sleepBedtime = entry.sleepStart.slice(11, 16);
            if (entry.sleepEnd) bucket.meta.sleepWakeTime = entry.sleepEnd.slice(11, 16);
          }
        }
      } else if (field) {
        const raw = entryValue(entry);
        if (raw != null) {
          // Convert kJ → kcal when HAE reports energy in kJ (common in EU/metric locales)
          const v = KCAL_FIELDS.has(field)
            ? normalizeEnergyValue(raw, metric.units)
            : raw;
          bucket.sums[field] = (bucket.sums[field] ?? 0) + v;
          bucket.counts[field] = (bucket.counts[field] ?? 0) + 1;
        }
      }

      byDate.set(dateKey, bucket);
    }
  }

  return Array.from(byDate.entries()).map(([date, { sums, counts, meta }]) => {
    const rec: Record<string, unknown> = { date, ...meta };
    for (const [field, sum] of Object.entries(sums)) {
      rec[field] = SUM_FIELDS.has(field) ? sum : sum / counts[field];
    }
    // Schema expects integers for some fields — round them
    for (const intField of ["steps", "restingHeartRate", "heartRateAvg", "exerciseMinutes", "standHours", "mindfulMinutes", "sleepDeepMinutes", "sleepRemMinutes"]) {
      if (typeof rec[intField] === "number") rec[intField] = Math.round(rec[intField] as number);
    }
    return rec;
  });
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

  // Diagnostic logging: what dates + metrics are coming in?
  if (isHAEPayload(body)) {
    const metricSummary = (body.data?.metrics ?? []).map((m) => {
      const dates = new Set<string>();
      for (const e of m.data ?? []) {
        const k = extractDateKey(e.sleepEnd ?? e.date);
        if (k) dates.add(k);
      }
      const u = m.units ? `[${m.units}]` : "";
      return `${m.name}${u}=[${Array.from(dates).sort().join(",")}](${(m.data ?? []).length})`;
    });
    console.log(`[health-data] HAE payload received. records=${records.length} dates=[${records.map((r) => r.date).sort().join(",")}] metrics: ${metricSummary.join(" | ")}`);

    // Sleep diagnostics: dump raw fields so we know what HAE actually provides
    const sleepMetric = (body.data?.metrics ?? []).find((m) => m.name === "sleep_analysis");
    if (sleepMetric) {
      for (const e of sleepMetric.data ?? []) {
        console.log(`[health-data] sleep_entry date=${extractDateKey(e.sleepEnd ?? e.date)} asleep=${e.asleep} inBed=${e.inBed} awake=${e.awake} deep=${e.deep} core=${e.core} rem=${e.rem} sleepStart=${e.sleepStart} sleepEnd=${e.sleepEnd}`);
      }
    }
  }

  const results = [];
  for (const record of records) {
    // Validate each field individually so one bad value doesn't reject the whole record.
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (value === undefined || value === null) continue;
      const fieldSchema = snapshotSchema.shape[key as keyof typeof snapshotSchema.shape];
      if (!fieldSchema) continue;
      const parsed = fieldSchema.safeParse(value);
      if (parsed.success) cleaned[key] = parsed.data;
    }

    const { date: dateStr, ...fields } = cleaned as { date?: string; [k: string]: unknown };
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
