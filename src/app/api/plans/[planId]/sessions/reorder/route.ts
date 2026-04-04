import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({ ids: z.array(z.string().uuid()).min(1) });

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
}
