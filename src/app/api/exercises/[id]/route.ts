import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateExerciseSchema } from "@/features/exercises/schemas";
import { readJsonBody, requireUserId, withApi } from "@/lib/api/route-handler";

export const GET = withApi(async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireUserId();

  const { id } = await params;

  const exercise = await prisma.exercise.findFirst({
    where: {
      id,
      OR: [{ userId: null }, { userId }],
    },
  });

  if (!exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  return NextResponse.json({ data: exercise });
});

export const PATCH = withApi(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireUserId();

  const { id } = await params;

  const exercise = await prisma.exercise.findFirst({
    where: { id, userId, isCustom: true },
  });

  if (!exercise) {
    return NextResponse.json(
      { error: "Exercise not found or cannot be edited" },
      { status: 404 }
    );
  }

  const body = await readJsonBody(req);
  const parsed = updateExerciseSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const updated = await prisma.exercise.update({
    where: { id },
    data: {
      ...parsed.data,
      notes: parsed.data.notes || null,
    },
  });

  return NextResponse.json({ data: updated });
});

export const DELETE = withApi(async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireUserId();

  const { id } = await params;

  const exercise = await prisma.exercise.findFirst({
    where: { id, userId, isCustom: true },
  });

  if (!exercise) {
    return NextResponse.json(
      { error: "Exercise not found or cannot be deleted" },
      { status: 404 }
    );
  }

  await prisma.exercise.delete({ where: { id } });

  return NextResponse.json({ success: true });
});
