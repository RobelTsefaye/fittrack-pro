import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { NutritionDetail } from "@/features/health/components/nutrition-detail";
import { getHealthSnapshots } from "@/features/health/health-data";

export const metadata = { title: `Ernährung — ${APP_NAME}` };

export default async function NutritionPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const snapshots = await getHealthSnapshots(session.user.id, 1);
  return <NutritionDetail initialSnapshot={snapshots.at(-1) ?? null} />;
}
