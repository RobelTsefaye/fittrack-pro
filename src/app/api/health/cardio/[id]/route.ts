import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Soft-deletes a single Apple Health cardio session. Not a real DELETE —
 * HealthKit stays the source of truth and re-syncs the same externalId on
 * every sync (see /api/health-data's upsert), so a hard delete would just
 * come back on the next sync. Hiding it instead: the upsert never touches
 * `hiddenAt`, so it stays hidden even after future syncs.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const workout = await prisma.appleWorkout.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!workout) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.appleWorkout.update({
    where: { id },
    data: { hiddenAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
