import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { getCurrentWeeklyTarget } from "@/features/health/nutrition-plan";
import { CALORIE_TARGET_DEFAULT, MACRO_TARGETS } from "@/features/health/nutrition-config";

// Server-side computation kept out of the client bundle (nutrition-plan.ts
// imports the Prisma client) — the client hook just fetches the already
// computed target instead of importing that module directly.
export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weeklyTarget = await getCurrentWeeklyTarget(userId);
  if (!weeklyTarget) {
    const targetOf = (key: string) => MACRO_TARGETS.find((t) => t.key === key)?.target ?? 0;
    return NextResponse.json({
      data: {
        calories: CALORIE_TARGET_DEFAULT,
        protein: targetOf("protein"),
        carbs: targetOf("carbs"),
        fat: targetOf("fat"),
        isPersonalized: false,
      },
    });
  }

  return NextResponse.json({
    data: {
      calories: weeklyTarget.calories,
      protein: weeklyTarget.protein,
      carbs: weeklyTarget.carbs,
      fat: weeklyTarget.fat,
      isPersonalized: true,
    },
  });
}
