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

  const targetPlanId = parsed.data.planId && parsed.data.planId !== existing.planId ? parsed.data.planId : null;
  if (targetPlanId) {
    const target = await prisma.workoutPlan.findFirst({ where: { id: targetPlanId, userId }, select: { id: true } });
    if (!target) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }
  const planId = targetPlanId ?? existing.planId;
  // A moved day keeps its weekdays; they are freed on the other days of its new plan.
  const weekdays = parsed.data.weekdays
    ? [...new Set(parsed.data.weekdays)].sort()
    : targetPlanId ? existing.weekdays : undefined;
  let deletedPlanId: string | null = null;
  const updated = await prisma.$transaction(async (tx) => {
    // A weekday belongs to one workout day per plan: taking it here frees it elsewhere.
    if (weekdays?.length) {
      const siblings = await tx.planSession.findMany({
        where: { planId, id: { not: sessionId }, weekdays: { hasSome: weekdays } },
        select: { id: true, weekdays: true },
      });
      for (const s of siblings) {
        await tx.planSession.update({ where: { id: s.id }, data: { weekdays: s.weekdays.filter((d) => !weekdays.includes(d)) } });
      }
    }
    let order = parsed.data.order;
    if (targetPlanId && order == null) {
      const last = await tx.planSession.aggregate({ where: { planId: targetPlanId }, _max: { order: true } });
      order = (last._max.order ?? -1) + 1;
    }
    const moved = await tx.planSession.update({
      where: { id: sessionId },
      data: {
        ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
        ...(order != null ? { order } : {}),
        ...(weekdays ? { weekdays } : {}),
        ...(targetPlanId ? { planId: targetPlanId } : {}),
      },
    });
    // The plan it came from is removed once it has no days left.
    if (targetPlanId && (await tx.planSession.count({ where: { planId: existing.planId } })) === 0) {
      await tx.workoutPlan.delete({ where: { id: existing.planId } });
      deletedPlanId = existing.planId;
    }
    return moved;
  });

  return NextResponse.json({ data: updated, deletedPlanId });
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
