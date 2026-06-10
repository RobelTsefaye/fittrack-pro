import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { ExerciseList } from "@/features/exercises/components/exercise-list";
import { ExerciseFilters } from "@/features/exercises/components/exercise-filters";
import { getExercises } from "@/features/exercises/exercise-data";

export const metadata = { title: `Exercises — ${APP_NAME}` };

export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<{ muscleGroup?: string; equipment?: string; search?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;
  const exercises = await getExercises(session.user.id, params);

  const initialQuery = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null) as [string, string][]
  ).toString();

  return (
    <div className="space-y-4">
      <Suspense>
        <ExerciseFilters />
        <ExerciseList initialExercises={exercises} initialQuery={initialQuery} />
      </Suspense>
    </div>
  );
}
