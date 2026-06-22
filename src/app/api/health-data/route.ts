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
    // Newest N first, then reversed — `asc` + take would return the OLDEST
    // rows once more than `limit` snapshots exist.
    orderBy: { date: "desc" },
    take: limit,
  });
  data.reverse();

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

/**
 * One HAE workout entry. Field shapes vary by HAE version — some report
 * primitives ({ qty, units } objects) and some report plain numbers, so we
 * defensively coerce in extractWorkoutNumber below.
 */
type HAEWorkoutValue = number | { qty?: number; units?: string };
type HAEWorkout = {
  id?: string;
  name?: string;
  start?: string;
  end?: string;
  startDate?: string;
  endDate?: string;
  duration?: number; // seconds
  distance?: HAEWorkoutValue;
  activeEnergyBurned?: HAEWorkoutValue;
  totalEnergyBurned?: HAEWorkoutValue;
  heartRateAvg?: HAEWorkoutValue;
  heartRateMax?: HAEWorkoutValue;
  avgHeartRate?: HAEWorkoutValue;
  maxHeartRate?: HAEWorkoutValue;
  elevationAscended?: HAEWorkoutValue;
  source?: string;
};

type HAEPayload = { data?: { metrics?: HAEMetric[]; workouts?: HAEWorkout[] } };

function isHAEPayload(body: unknown): body is HAEPayload {
  if (!body || typeof body !== "object" || !("data" in body)) return false;
  const data = (body as HAEPayload).data;
  if (!data) return false;
  return Array.isArray(data.metrics) || Array.isArray(data.workouts);
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
 * Extract a numeric value from HAE's varying field shapes:
 *   - number (legacy HAE)
 *   - { qty: number, units: string } (modern HAE)
 * Returns null if the value can't be coerced.
 */
function extractWorkoutNumber(v: HAEWorkoutValue | undefined): { qty: number; units: string | null } | null {
  if (v == null) return null;
  if (typeof v === "number") return { qty: v, units: null };
  if (typeof v === "object" && typeof v.qty === "number") {
    return { qty: v.qty, units: v.units ?? null };
  }
  return null;
}

/**
 * Distance can arrive in km, m, miles. Normalize to meters.
 */
function distanceToMeters(qty: number, units: string | null): number {
  if (!units) return qty; // assume meters when unitless
  const u = units.toLowerCase();
  if (u === "km" || u === "kilometer" || u === "kilometers") return qty * 1000;
  if (u === "mi" || u === "mile" || u === "miles") return qty * 1609.344;
  // m, meter, meters → identity
  return qty;
}

/**
 * Normalize an energy value to kcal (matches normalizeEnergyValue but takes
 * a nullable units string — workouts have it nested rather than top-level).
 */
function calToKcal(qty: number, units: string | null): number {
  if (!units) return qty;
  const u = units.toLowerCase();
  if (u === "kj" || u === "kilojoule" || u === "kilojoules") return qty / 4.184;
  return qty;
}

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

// Fields where we want the day's PEAK value, not the average.
// HRV varies wildly throughout the day (drops during stress/exercise, peaks
// during deep rest/sleep). The peak — typically captured during sleep — is
// the most representative measure of recovery capacity and what Apple Health
// itself surfaces as "Heart Rate Variability".
const MAX_FIELDS = new Set<string>(["hrv"]);

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
          if (MAX_FIELDS.has(field)) {
            // Track the day's peak instead of accumulating
            const existing = bucket.sums[field];
            bucket.sums[field] = existing == null ? v : Math.max(existing, v);
            bucket.counts[field] = 1;
          } else {
            bucket.sums[field] = (bucket.sums[field] ?? 0) + v;
            bucket.counts[field] = (bucket.counts[field] ?? 0) + 1;
          }
        }
      }

      byDate.set(dateKey, bucket);
    }
  }

  return Array.from(byDate.entries()).map(([date, { sums, counts, meta }]) => {
    const rec: Record<string, unknown> = { date, ...meta };
    for (const [field, sum] of Object.entries(sums)) {
      // SUM and MAX fields store the final value directly; everything else
      // is an instantaneous-reading average (sum ÷ count).
      rec[field] = SUM_FIELDS.has(field) || MAX_FIELDS.has(field)
        ? sum
        : sum / counts[field];
    }
    // Schema expects integers for some fields — round them
    for (const intField of ["steps", "restingHeartRate", "heartRateAvg", "exerciseMinutes", "standHours", "mindfulMinutes", "sleepDeepMinutes", "sleepRemMinutes"]) {
      if (typeof rec[intField] === "number") rec[intField] = Math.round(rec[intField] as number);
    }
    return rec;
  });
}

/**
 * Map an HAE workout entry → AppleWorkout row, or null if the entry can't
 * be uniquely identified (missing id + missing start/end timestamps).
 * Units are normalized: distance → meters, energy → kcal.
 */
function transformHAEWorkout(w: HAEWorkout): {
  externalId: string;
  type: string;
  startedAt: Date;
  endedAt: Date;
  durationSec: number;
  distanceMeters: number | null;
  activeCalories: number | null;
  totalCalories: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  elevationGainM: number | null;
  source: string | null;
} | null {
  const startStr = w.start ?? w.startDate;
  const endStr = w.end ?? w.endDate;
  if (!startStr || !endStr) return null;

  const startedAt = new Date(startStr);
  const endedAt = new Date(endStr);
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) return null;

  // Synthesize a deterministic external ID when HAE doesn't provide one,
  // so re-syncs of the same workout still dedupe via the unique constraint.
  const externalId = w.id ?? `${w.name ?? "workout"}-${startedAt.toISOString()}`;

  const durationSec = typeof w.duration === "number"
    ? Math.round(w.duration)
    : Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);

  const dist = extractWorkoutNumber(w.distance);
  const distanceMeters = dist ? distanceToMeters(dist.qty, dist.units) : null;

  const ace = extractWorkoutNumber(w.activeEnergyBurned);
  const activeCalories = ace ? calToKcal(ace.qty, ace.units) : null;
  const tce = extractWorkoutNumber(w.totalEnergyBurned);
  const totalCalories = tce ? calToKcal(tce.qty, tce.units) : null;

  const hrAvg = extractWorkoutNumber(w.heartRateAvg ?? w.avgHeartRate);
  const hrMax = extractWorkoutNumber(w.heartRateMax ?? w.maxHeartRate);
  const elev = extractWorkoutNumber(w.elevationAscended);

  return {
    externalId,
    type: w.name ?? "Workout",
    startedAt,
    endedAt,
    durationSec,
    distanceMeters: distanceMeters != null && distanceMeters > 0 ? distanceMeters : null,
    activeCalories,
    totalCalories,
    avgHeartRate: hrAvg ? Math.round(hrAvg.qty) : null,
    maxHeartRate: hrMax ? Math.round(hrMax.qty) : null,
    elevationGainM: elev ? elev.qty : null,
    source: w.source ?? null,
  };
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

  // ── Workouts (from a separate HAE automation with Data Type = Workouts) ──
  let workoutsImported = 0;
  if (isHAEPayload(body)) {
    const workouts = body.data?.workouts ?? [];
    if (workouts.length > 0) {
      const types = new Set<string>();
      for (const w of workouts) {
        const row = transformHAEWorkout(w);
        if (!row) continue;
        types.add(row.type);
        await prisma.appleWorkout.upsert({
          where: { userId_externalId: { userId, externalId: row.externalId } },
          create: { userId, ...row },
          update: {
            type: row.type, startedAt: row.startedAt, endedAt: row.endedAt,
            durationSec: row.durationSec, distanceMeters: row.distanceMeters,
            activeCalories: row.activeCalories, totalCalories: row.totalCalories,
            avgHeartRate: row.avgHeartRate, maxHeartRate: row.maxHeartRate,
            elevationGainM: row.elevationGainM, source: row.source,
          },
        });
        workoutsImported++;
      }
      console.log(`[health-data] HAE workouts imported: ${workoutsImported}/${workouts.length} (types: ${Array.from(types).join(", ")})`);
    }
  }

  return NextResponse.json({ data: results, count: results.length, workoutsImported });
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
