import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { BackButton } from "@/components/layout/back-button";
import { HealthDashboard } from "@/features/health/components/health-dashboard";
import { getHealthSnapshots } from "@/features/health/health-data";
import { computeRecovery } from "@/features/health/recovery";
import { getCardioSummary } from "@/features/health/cardio";

export const metadata = { title: `Health — ${APP_NAME}` };

export default async function HealthPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [snapshots, recovery, cardio] = await Promise.all([
    getHealthSnapshots(session.user.id, 30),
    computeRecovery(session.user.id),
    getCardioSummary(session.user.id),
  ]);

  return (
    <>
      <BackButton />
      <HealthDashboard
        initialSnapshots={snapshots}
        initialRecovery={recovery}
        initialCardio={cardio}
      />
    </>
  );
}
