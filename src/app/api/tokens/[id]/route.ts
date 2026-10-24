import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, withApi } from "@/lib/api/route-handler";

export const DELETE = withApi(async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireUserId();

  const { id } = await params;
  const existing = await prisma.apiToken.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.apiToken.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
