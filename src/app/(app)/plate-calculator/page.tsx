import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { APP_NAME } from "@/lib/constants";
import { PlateCalculator } from "@/features/tools/components/plate-calculator";

export const metadata = { title: `Plate Calculator — ${APP_NAME}` };

export default async function PlateCalculatorPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
    select: { weightUnit: true },
  });

  return (
    <div className="space-y-5">
      <div className="shrink-0">
        <h1 className="page-title leading-none">Plate Calculator</h1>
        <p className="mt-1 text-sm text-[var(--sys-label2)]">
          Load your barbell in seconds
        </p>
      </div>
      <PlateCalculator defaultUnit={settings?.weightUnit ?? "KG"} />
    </div>
  );
}
