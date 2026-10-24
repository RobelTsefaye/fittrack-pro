import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { requireUserId, withApi } from "@/lib/api/route-handler";

const schema = z.object({ ids: z.array(z.string().uuid()).min(1) });

export const POST = withApi(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const userId = await requireUserId();

  const { planId } = await params;

  const plan = await prisma.workoutPlan.findFirst({
    where: { id: planId, userId },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  await prisma.$transaction(
    body.data.ids.map((sessionId, index) =>
      prisma.planSession.updateMany({
        where: { id: sessionId, planId },
        data: { order: index + 1 },
      })
    )
  );

  return NextResponse.json({ success: true });
});
