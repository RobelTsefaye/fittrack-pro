import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { RecoveryDetail } from "@/features/health/components/recovery-detail";
import { computeRecovery, computeRecoveryHistory } from "@/features/health/recovery";

export const metadata = { title: `Recovery — ${APP_NAME}` };

export default async function RecoveryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [recovery, history] = await Promise.all([
    computeRecovery(session.user.id),
    computeRecoveryHistory(session.user.id, 30),
  ]);

  return <RecoveryDetail initialRecovery={recovery} initialHistory={history} />;
}
