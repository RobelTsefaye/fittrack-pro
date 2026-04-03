import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WorkoutDetail } from "@/features/workouts/components/workout-detail";

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  });

  const { id } = await params;

  return (
    <WorkoutDetail
      workoutId={id}
      defaultRestSeconds={settings?.restTimerDefault ?? 90}
      weightUnit={settings?.weightUnit ?? "KG"}
    />
  );
}
