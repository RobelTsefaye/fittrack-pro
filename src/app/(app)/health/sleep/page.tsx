import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { SleepDetail } from "@/features/health/components/sleep-detail";
import { getHealthSnapshots } from "@/features/health/health-data";

export const metadata = { title: `Schlaf — ${APP_NAME}` };

export default async function SleepPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const snapshots = await getHealthSnapshots(session.user.id, 90);
  return <SleepDetail initialSnapshots={snapshots} />;
}
