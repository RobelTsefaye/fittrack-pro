import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  neck:       z.number().positive().optional().nullable(),
  chest:      z.number().positive().optional().nullable(),
  leftArm:    z.number().positive().optional().nullable(),
  rightArm:   z.number().positive().optional().nullable(),
  waist:      z.number().positive().optional().nullable(),
  hips:       z.number().positive().optional().nullable(),
  leftThigh:  z.number().positive().optional().nullable(),
  rightThigh: z.number().positive().optional().nullable(),
  notes:      z.string().max(500).optional().nullable(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await prisma.bodyMeasurement.findMany({
    where: { userId: session.user.id },
    orderBy: { date: "asc" },
  });

  return NextResponse.json({ data: entries.map((e) => ({
    ...e,
    date: e.date.toISOString().slice(0, 10),
    createdAt: e.createdAt.toISOString(),
  })) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { date, ...rest } = parsed.data;

  const entry = await prisma.bodyMeasurement.upsert({
    where: { userId_date: { userId: session.user.id, date: new Date(date) } },
    update: rest,
    create: { userId: session.user.id, date: new Date(date), ...rest },
  });

  return NextResponse.json({ data: { ...entry, date: entry.date.toISOString().slice(0, 10) } });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.bodyMeasurement.deleteMany({
    where: { id, userId: session.user.id },
  });

  return NextResponse.json({ ok: true });
}
