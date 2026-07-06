import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { SleepStagesDetail } from "@/features/health/components/sleep-stages-detail";
import { getHealthSnapshots } from "@/features/health/health-data";

export const metadata = { title: `Schlafphasen — ${APP_NAME}` };

export default async function SleepStagesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const snapshots = await getHealthSnapshots(session.user.id, 90);
  return <SleepStagesDetail initialSnapshots={snapshots} />;
}
