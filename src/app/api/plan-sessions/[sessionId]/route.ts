import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updatePlanSessionSchema } from "@/features/plans/schemas";
import { readJsonBody, requireUserId, withApi } from "@/lib/api/route-handler";

async function getSessionForUser(sessionId: string, userId: string) {
  return prisma.planSession.findFirst({
    where: { id: sessionId, plan: { userId } },
  });
}

export const PATCH = withApi(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const userId = await requireUserId();

  const { sessionId } = await params;
  const existing = await getSessionForUser(sessionId, userId);
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const body = await readJsonBody(req);
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
});

export const DELETE = withApi(async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const userId = await requireUserId();

  const { sessionId } = await params;
  const existing = await getSessionForUser(sessionId, userId);
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await prisma.planSession.delete({ where: { id: sessionId } });
  return NextResponse.json({ ok: true });
});
