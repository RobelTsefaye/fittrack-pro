import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { APP_NAME } from "@/lib/constants";
import { getAllPersonalRecords, getAchievements } from "@/services/personal-records";
import { getDashboardSummary } from "@/features/dashboard/queries";
import { BackButton } from "@/components/layout/back-button";
import { RecordsView } from "@/features/records/components/records-view";

export const metadata = { title: `Personal Records — ${APP_NAME}` };

export default async function RecordsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  const [settings, records, summary] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId } }),
    getAllPersonalRecords(userId),
    getDashboardSummary(userId),
  ]);

  const achievements = await getAchievements(userId, summary.workoutStreakDays);
  const weightUnit = settings?.weightUnit ?? "KG";

  return (
    <Suspense fallback={null}>
      <BackButton />
      <RecordsView
        records={records}
        achievements={achievements}
        weightUnit={weightUnit}
        streak={summary.workoutStreakDays}
        totalWorkouts={summary.totalWorkouts}
        totalPRs={summary.personalRecordsCount}
      />
    </Suspense>
  );
}
