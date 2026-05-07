import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WorkoutDetail } from "@/features/workouts/components/workout-detail";
import { SettingsCacher } from "./settings-cacher";

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
  const weightUnit = settings?.weightUnit ?? "KG";
  const restTimerDefault = settings?.restTimerDefault ?? 90;

  return (
    <>
      {/* Cache settings in localStorage so offline workout start can read them */}
      <SettingsCacher weightUnit={weightUnit} restTimerDefault={restTimerDefault} />
      <WorkoutDetail
        workoutId={id}
        defaultRestSeconds={restTimerDefault}
        weightUnit={weightUnit}
      />
    </>
  );
}
