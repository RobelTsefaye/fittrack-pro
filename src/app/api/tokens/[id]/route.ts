import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveUserIdForDataApi } from "@/lib/api-auth";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
}
