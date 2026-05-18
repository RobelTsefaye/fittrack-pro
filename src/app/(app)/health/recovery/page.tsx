import { APP_NAME } from "@/lib/constants";
import { RecoveryDetail } from "@/features/health/components/recovery-detail";

export const metadata = { title: `Recovery — ${APP_NAME}` };

export default function RecoveryPage() {
  return <RecoveryDetail />;
}
