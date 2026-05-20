import { APP_NAME } from "@/lib/constants";
import { NutritionDetail } from "@/features/health/components/nutrition-detail";

export const metadata = { title: `Ernährung — ${APP_NAME}` };

export default function NutritionPage() {
  return <NutritionDetail />;
}
