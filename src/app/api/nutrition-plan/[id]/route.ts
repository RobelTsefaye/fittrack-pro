import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { updateNutritionPlanSchema } from "@/features/health/nutrition-plan-schemas";
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

// Corrections to a plan row only — phase/startDate are immutable (rejected by
// the schema), since changing them would rewrite history instead of starting
// a new phase (use POST /api/nutrition-plan for that).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (body && typeof body === "object" && ("phase" in body || "startDate" in body)) {
    return NextResponse.json(
      { error: "phase/startDate cannot be changed — start a new plan instead" },
      { status: 400 }
    );
  }

  const parsed = updateNutritionPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.nutritionPlan.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { notes, ...rest } = parsed.data;
  const updated = await prisma.nutritionPlan.update({
    where: { id },
    data: {
      ...rest,
      ...(notes !== undefined ? { notes: notes?.trim() ? notes.trim() : null } : {}),
    },
  });

  return NextResponse.json({ data: toDTO(updated) });
}
