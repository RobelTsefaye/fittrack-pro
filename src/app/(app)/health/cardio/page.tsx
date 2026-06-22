import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { CardioDetail } from "@/features/health/components/cardio-detail";
import { getCardioSummary } from "@/features/health/cardio";

export const metadata = { title: `Cardio — ${APP_NAME}` };
export const dynamic = "force-dynamic";

export default async function CardioPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const summary = await getCardioSummary(session.user.id);
  return <CardioDetail summary={summary} />;
}
