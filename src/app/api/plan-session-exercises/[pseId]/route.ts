import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { updatePlanSessionExerciseSchema } from "@/features/plans/schemas";

async function getPseForUser(pseId: string, userId: string) {
  return prisma.planSessionExercise.findFirst({
    where: {
      id: pseId,
      planSession: { plan: { userId } },
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ pseId: string }> }
) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pseId } = await params;
  const existing = await getPseForUser(pseId, userId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updatePlanSessionExerciseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const updated = await prisma.planSessionExercise.update({
    where: { id: pseId },
    data: {
      ...(parsed.data.targetSets != null ? { targetSets: parsed.data.targetSets } : {}),
    },
    include: {
      exercise: {
        select: { id: true, name: true, muscleGroup: true, equipment: true },
      },
    },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ pseId: string }> }
) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pseId } = await params;
  const existing = await getPseForUser(pseId, userId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.planSessionExercise.delete({ where: { id: pseId } });
  return NextResponse.json({ ok: true });
}
