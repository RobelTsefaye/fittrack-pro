import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updatePlanSchema } from "@/features/plans/schemas";
import { requireUserId, withApi } from "@/lib/api/route-handler";

async function getOwnedPlan(planId: string, userId: string) {
  return prisma.workoutPlan.findFirst({
    where: { id: planId, userId },
    include: {
      sessions: {
        orderBy: { order: "asc" },
        include: {
          exercises: {
            orderBy: { order: "asc" },
            include: {
              exercise: {
                select: { id: true, name: true, muscleGroup: true, equipment: true },
              },
            },
          },
        },
      },
    },
  });
}

export const GET = withApi(async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const userId = await requireUserId();

  const { planId } = await params;
  const plan = await getOwnedPlan(planId, userId);
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  return NextResponse.json({ data: plan });
});

export const PATCH = withApi(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const userId = await requireUserId();

  const { planId } = await params;
  const existing = await prisma.workoutPlan.findFirst({
    where: { id: planId, userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updatePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const updated = await prisma.workoutPlan.update({
    where: { id: planId },
    data: {
      ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description }
        : {}),
    },
  });

  return NextResponse.json({ data: updated });
});

export const DELETE = withApi(async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const userId = await requireUserId();

  const { planId } = await params;
  const existing = await prisma.workoutPlan.findFirst({
    where: { id: planId, userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  await prisma.workoutPlan.delete({ where: { id: planId } });
  return NextResponse.json({ ok: true });
});
