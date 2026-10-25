import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPlanSchema } from "@/features/plans/schemas";
import { readJsonBody, requireUserId, withApi } from "@/lib/api/route-handler";

export const GET = withApi(async function GET() {
  const userId = await requireUserId();

  const plans = await prisma.workoutPlan.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { sessions: true } },
      // Day names for the coloured chips in the list.
      sessions: { select: { id: true, name: true, weekdays: true }, orderBy: { order: "asc" } },
    },
  });

  return NextResponse.json({ data: plans });
});

export const POST = withApi(async function POST(req: NextRequest) {
  const userId = await requireUserId();

  const body = await readJsonBody(req);
  const parsed = createPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const plan = await prisma.workoutPlan.create({
    data: {
      userId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    },
  });

  return NextResponse.json({ data: plan }, { status: 201 });
});
