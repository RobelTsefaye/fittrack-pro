import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { APP_NAME } from "@/lib/constants";
import { getDashboardClientPayload } from "@/features/dashboard/queries";
import { DashboardAnalytics } from "@/features/dashboard/components/dashboard-analytics";
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
    <DashboardAnalytics
      userName={userName}
      weightUnit={settings?.weightUnit ?? "KG"}
      payload={payload}
    />
  );
}
