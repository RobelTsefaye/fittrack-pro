import { APP_NAME } from "@/lib/constants";
import { HealthDashboard } from "@/features/health/components/health-dashboard";

export const metadata = { title: `Health — ${APP_NAME}` };

export default function HealthPage() {
  return <HealthDashboard />;
}
