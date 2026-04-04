import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({ ids: z.array(z.string().uuid()).min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;

  const planSession = await prisma.planSession.findFirst({
    where: { id: sessionId, plan: { userId: session.user.id } },
  });
  if (!planSession) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  await prisma.$transaction(
    body.data.ids.map((pseId, index) =>
      prisma.planSessionExercise.updateMany({
        where: { id: pseId, planSessionId: sessionId },
        data: { order: index + 1 },
      })
    )
  );

  return NextResponse.json({ success: true });
}
