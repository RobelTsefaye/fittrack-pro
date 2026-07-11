import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workoutId } = await params;

  const workout = await prisma.workout.findFirst({
    where: { id: workoutId, userId: userId, completedAt: null },
  });

  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  await prisma.$transaction(
    body.data.ids.map((weId, index) =>
      prisma.workoutExercise.updateMany({
        where: { id: weId, workoutId },
        data: { order: index + 1 },
      })
    )
  );

  return NextResponse.json({ success: true });
}
