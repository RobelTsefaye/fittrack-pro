import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { APP_NAME } from "@/lib/constants";
import { MostUsedExercisesView } from "@/features/exercises/components/most-used-exercises-view";

export const metadata = { title: `Exercise progress — ${APP_NAME}` };

export default async function ExercisesUsagePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  });

  return (
    <MostUsedExercisesView weightUnit={settings?.weightUnit ?? "KG"} />
  );
}
