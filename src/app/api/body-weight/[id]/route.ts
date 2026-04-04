import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dashboardCacheTag } from "@/lib/constants";
import { updateBodyWeightSchema } from "@/features/tracking/schemas";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.bodyWeight.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateBodyWeightSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const updated = await prisma.bodyWeight.update({
    where: { id },
    data: {
      ...parsed.data,
      notes:
        parsed.data.notes === undefined
          ? undefined
          : parsed.data.notes === null
            ? null
            : parsed.data.notes,
    },
  });

  revalidateTag(dashboardCacheTag(session.user.id), "max");

  return NextResponse.json({
    data: {
      id: updated.id,
      weight: updated.weight,
      date: updated.date.toISOString().slice(0, 10),
      notes: updated.notes,
      createdAt: updated.createdAt.toISOString(),
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.bodyWeight.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  await prisma.bodyWeight.delete({ where: { id } });

  revalidateTag(dashboardCacheTag(session.user.id), "max");

  return NextResponse.json({ success: true });
}
