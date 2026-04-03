import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ExerciseDetailView } from "@/features/exercises/components/exercise-detail-view";

export default async function ExerciseDetailPage({
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
    <ExerciseDetailView
      exerciseId={id}
      weightUnit={settings?.weightUnit ?? "KG"}
    />
  );
}
