import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createExerciseSchema } from "@/features/exercises/schemas";

export async function GET(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const muscleGroup = searchParams.get("muscleGroup");
  const equipment = searchParams.get("equipment");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = {
    OR: [{ userId: null }, { userId }],
  };

  if (muscleGroup && muscleGroup !== "ALL") {
    where.muscleGroup = muscleGroup;
  }

  if (equipment && equipment !== "ALL") {
    where.equipment = equipment;
  }

  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }

  const exercises = await prisma.exercise.findMany({
    where,
    orderBy: [{ isCustom: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({ data: exercises });
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createExerciseSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const exercise = await prisma.exercise.create({
    data: {
      ...parsed.data,
      notes: parsed.data.notes || null,
      userId,
      isCustom: true,
    },
  });

  return NextResponse.json({ data: exercise }, { status: 201 });
}
