import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { updatePlanSessionSchema } from "@/features/plans/schemas";

async function getSessionForUser(sessionId: string, userId: string) {
  return prisma.planSession.findFirst({
    where: { id: sessionId, plan: { userId } },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const existing = await getSessionForUser(sessionId, userId);
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updatePlanSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const updated = await prisma.planSession.update({
    where: { id: sessionId },
    data: {
      ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      ...(parsed.data.order != null ? { order: parsed.data.order } : {}),
    },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const existing = await getSessionForUser(sessionId, userId);
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await prisma.planSession.delete({ where: { id: sessionId } });
  return NextResponse.json({ ok: true });
}
