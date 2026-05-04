import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { APP_NAME } from "@/lib/constants";
import { BodyTrackingShell } from "@/features/tracking/components/body-tracking-shell";

export const metadata = { title: `Body Tracking — ${APP_NAME}` };

export default async function BodyWeightPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  });

  return <BodyTrackingShell weightUnit={settings?.weightUnit ?? "KG"} />;
}
