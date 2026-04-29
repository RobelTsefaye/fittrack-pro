import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { APP_NAME } from "@/lib/constants";
import { getDashboardClientPayload } from "@/features/dashboard/queries";
import { DashboardAnalytics } from "@/features/dashboard/components/dashboard-analytics";
import { MuscleHeatmapCard } from "@/features/dashboard/components/muscle-heatmap-card";
import { DashboardPageSkeleton } from "./dashboard-page-skeleton";

export const metadata = { title: `Dashboard — ${APP_NAME}` };

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <Suspense fallback={<DashboardPageSkeleton />}>
      <DashboardData
        userId={session.user.id}
        userName={session.user?.name}
      />
    </Suspense>
  );
}

async function DashboardData({
  userId,
  userName,
}: {
  userId: string;
  userName?: string | null;
}) {
  const [settings, payload] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId } }),
    getDashboardClientPayload(userId),
  ]);

  return (
    <div className="space-y-6">
      <DashboardAnalytics
        userName={userName}
        weightUnit={settings?.weightUnit ?? "KG"}
        payload={payload}
      />
      {/* Muscle heatmap — streamed in separately so it doesn't block dashboard */}
      <Suspense fallback={
        <div className="ios-group px-4 py-4 animate-pulse">
          <div className="mb-3 h-5 w-28 rounded-md bg-muted/60" />
          <div className="mx-auto h-64 w-44 rounded-2xl bg-muted/40" />
        </div>
      }>
        <MuscleHeatmapCard userId={userId} />
      </Suspense>
    </div>
  );
}
