import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { dashboardCacheTag } from "@/lib/constants";
import { createBodyWeightSchema } from "@/features/tracking/schemas";
import { parseDateOnlyUtc } from "@/lib/date-only";
import { requireUserId, withApi } from "@/lib/api/route-handler";

export const GET = withApi(async function GET(req: NextRequest) {
  const userId = await requireUserId();

  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // Malformed dates throw InvalidDateError → 400 via withApi.
  const where: Prisma.BodyWeightWhereInput = { userId };
  if (from || to) {
    where.date = {
      ...(from && { gte: parseDateOnlyUtc(from) }),
      ...(to && { lte: parseDateOnlyUtc(to) }),
    };
  }

  const entries = await prisma.bodyWeight.findMany({
    where,
    orderBy: { date: "desc" },
  });

  const data = entries.map((e) => ({
    id: e.id,
    weight: e.weight,
    date: e.date.toISOString().slice(0, 10),
    notes: e.notes,
    createdAt: e.createdAt.toISOString(),
  }));

  return NextResponse.json({ data });
});

export const POST = withApi(async function POST(req: NextRequest) {
  const userId = await requireUserId();

  const body = await req.json();
  const parsed = createBodyWeightSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const date = parseDateOnlyUtc(parsed.data.date);
  const notes = parsed.data.notes?.trim() ? parsed.data.notes.trim() : null;

  const entry = await prisma.bodyWeight.upsert({
    where: {
      userId_date: {
        userId,
        date,
      },
    },
    create: {
      userId,
      date,
      weight: parsed.data.weight,
      notes,
    },
    update: {
      weight: parsed.data.weight,
      notes,
    },
  });

  revalidateTag(dashboardCacheTag(userId), "max");

  return NextResponse.json({
    data: {
      id: entry.id,
      weight: entry.weight,
      date: entry.date.toISOString().slice(0, 10),
      notes: entry.notes,
      createdAt: entry.createdAt.toISOString(),
    },
  });
});
