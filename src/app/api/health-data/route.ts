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

// POST /api/health-data — upsert (iOS Shortcut or web form)
export async function POST(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = snapshotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid data" },
      { status: 400 }
    );
  }

  const { date: dateStr, ...fields } = parsed.data;
  const date = dateStr
    ? new Date(dateStr + "T00:00:00.000Z")
    : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");

  // Only write fields that were explicitly sent (don't overwrite with undefined)
  const data = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined)
  );

  const snapshot = await prisma.healthSnapshot.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, ...data },
    update: data,
  });

  return NextResponse.json({ data: snapshot });
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
