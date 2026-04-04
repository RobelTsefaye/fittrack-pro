import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dashboardCacheTag } from "@/lib/constants";
import { createBodyWeightSchema } from "@/features/tracking/schemas";
import { parseDateOnlyUtc } from "@/lib/date-only";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Record<string, unknown> = { userId: session.user.id };
  if (from || to) {
    where.date = {};
    if (from) {
      (where.date as Record<string, Date>).gte = parseDateOnlyUtc(from);
    }
    if (to) {
      (where.date as Record<string, Date>).lte = parseDateOnlyUtc(to);
    }
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
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
        userId: session.user.id,
        date,
      },
    },
    create: {
      userId: session.user.id,
      date,
      weight: parsed.data.weight,
      notes,
    },
    update: {
      weight: parsed.data.weight,
      notes,
    },
  });

  revalidateTag(dashboardCacheTag(session.user.id), "max");

  return NextResponse.json({
    data: {
      id: entry.id,
      weight: entry.weight,
      date: entry.date.toISOString().slice(0, 10),
      notes: entry.notes,
      createdAt: entry.createdAt.toISOString(),
    },
  });
}
