import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { APP_NAME } from "@/lib/constants";
import { getDashboardClientPayload } from "@/features/dashboard/queries";
import { DashboardAnalytics } from "@/features/dashboard/components/dashboard-analytics";

export const metadata = { title: `Dashboard — ${APP_NAME}` };

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const [settings, payload] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId: session.user.id } }),
    getDashboardClientPayload(session.user.id),
  ]);

  return (
    <DashboardAnalytics
      userName={session.user?.name}
      weightUnit={settings?.weightUnit ?? "KG"}
      payload={payload}
    />
  );
}
