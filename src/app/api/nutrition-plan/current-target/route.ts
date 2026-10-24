import { NextResponse } from "next/server";
import { getCurrentWeeklyTarget } from "@/features/health/nutrition-plan";
import { CALORIE_TARGET_DEFAULT, MACRO_TARGETS } from "@/features/health/nutrition-config";
import { requireUserId, withApi } from "@/lib/api/route-handler";

// Server-side computation kept out of the client bundle (nutrition-plan.ts
// imports the Prisma client) — the client hook just fetches the already
// computed target instead of importing that module directly.
export const GET = withApi(async function GET() {
  const userId = await requireUserId();

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
});
