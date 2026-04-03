import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { APP_NAME } from "@/lib/constants";
import { BodyWeightTracker } from "@/features/tracking/components/body-weight-tracker";

export const metadata = { title: `Body Weight — ${APP_NAME}` };

export default async function BodyWeightPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  });

  return <BodyWeightTracker weightUnit={settings?.weightUnit ?? "KG"} />;
}
