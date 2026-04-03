import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createPlanSessionSchema } from "@/features/plans/schemas";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { planId } = await params;
  const plan = await prisma.workoutPlan.findFirst({
    where: { id: planId, userId: session.user.id },
  });
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createPlanSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const last = await prisma.planSession.findFirst({
    where: { planId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const order = (last?.order ?? -1) + 1;

  const created = await prisma.planSession.create({
    data: {
      planId,
      name: parsed.data.name,
      order,
      notes: parsed.data.notes ?? null,
    },
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
