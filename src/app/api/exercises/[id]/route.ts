import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { updateExerciseSchema } from "@/features/exercises/schemas";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const body = await req.json();
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
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
}
