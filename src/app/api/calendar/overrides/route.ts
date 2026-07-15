import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { parseDateOnlyUtc } from "@/lib/date-only";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const kind = z.enum(["training", "cardio"]);
const schema = z.object({ kind, date, skip: z.boolean().optional(), movedToDate: date.nullable().optional(), timeMinutes: z.number().int().min(0).max(1439).nullable().optional(), durationMinutes: z.number().int().min(1).max(1439).nullable().optional() });
const toKind = (value: z.infer<typeof kind>) => value === "training" ? "TRAINING" as const : "CARDIO" as const;
export async function PUT(req: NextRequest) {
  const userId = await resolveUserIdForDataApi(); if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const value = parsed.data; const calendarKind = toKind(value.kind); const key = { userId_kind_date: { userId, kind: calendarKind, date: parseDateOnlyUtc(value.date) } };
  const data = { skip: value.skip ?? false, movedToDate: value.movedToDate ? parseDateOnlyUtc(value.movedToDate) : null, timeMinutes: value.timeMinutes ?? null, durationMinutes: value.durationMinutes ?? null };
  if (!data.skip && !data.movedToDate && data.timeMinutes === null && data.durationMinutes === null) { await prisma.calendarOverride.delete({ where: key }).catch(() => {}); return NextResponse.json({ data: null }); }
  const override = await prisma.calendarOverride.upsert({ where: key, create: { userId, kind: calendarKind, date: parseDateOnlyUtc(value.date), ...data }, update: data });
  return NextResponse.json({ data: override });
}
export async function DELETE(req: NextRequest) {
  const userId = await resolveUserIdForDataApi(); if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z.object({ kind, date }).safeParse(Object.fromEntries(req.nextUrl.searchParams)); if (!parsed.success) return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  await prisma.calendarOverride.delete({ where: { userId_kind_date: { userId, kind: toKind(parsed.data.kind), date: parseDateOnlyUtc(parsed.data.date) } } }).catch(() => {});
  return NextResponse.json({ data: null });
}
