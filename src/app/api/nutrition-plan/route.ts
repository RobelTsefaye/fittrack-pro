import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { parseDateOnlyUtc } from "@/lib/date-only";
import { createNutritionPlanSchema } from "@/features/health/nutrition-plan-schemas";
import type { NutritionPlan } from "@/generated/prisma/client";

function toDTO(row: NutritionPlan) {
  return {
    id: row.id,
    phase: row.phase,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
    startCalories: row.startCalories,
    weeklyCalorieStep: row.weeklyCalorieStep,
    minCalories: row.minCalories,
    maxCalories: row.maxCalories,
    proteinPerKg: row.proteinPerKg,
    fatPerKg: row.fatPerKg,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.nutritionPlan.findMany({
    where: { userId },
    orderBy: { startDate: "desc" },
  });

  const active = rows.find((r) => r.endDate === null) ?? null;
  const history = rows.filter((r) => r.id !== active?.id);

  return NextResponse.json({
    data: {
      active: active ? toDTO(active) : null,
      history: history.map(toDTO),
    },
  });
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createNutritionPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  let startDate: Date;
  try {
    startDate = parseDateOnlyUtc(parsed.data.startDate);
  } catch {
    return NextResponse.json(
      { error: "Invalid date format; expected YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const { phase, startCalories, weeklyCalorieStep, minCalories, maxCalories, proteinPerKg, fatPerKg, notes } =
    parsed.data;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.nutritionPlan.findFirst({
        where: { userId, endDate: null },
      });

      if (existing) {
        if (existing.startDate.getTime() > startDate.getTime()) {
          throw new Error("NEW_PLAN_BEFORE_ACTIVE");
        }
        await tx.nutritionPlan.update({
          where: { id: existing.id },
          data: { endDate: startDate },
        });
      }

      return tx.nutritionPlan.create({
        data: {
          userId,
          phase,
          startDate,
          startCalories,
          weeklyCalorieStep,
          minCalories: minCalories ?? null,
          maxCalories: maxCalories ?? null,
          proteinPerKg,
          fatPerKg,
          notes: notes?.trim() ? notes.trim() : null,
        },
      });
    });

    return NextResponse.json({ data: toDTO(created) }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "NEW_PLAN_BEFORE_ACTIVE") {
      return NextResponse.json(
        { error: "New plan must start on or after the current plan's start date" },
        { status: 400 }
      );
    }
    throw err;
  }
}
