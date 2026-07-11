import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createPlanSchema } from "@/features/plans/schemas";

export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plans = await prisma.workoutPlan.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { sessions: true } },
    },
  });

  return NextResponse.json({ data: plans });
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
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
}
