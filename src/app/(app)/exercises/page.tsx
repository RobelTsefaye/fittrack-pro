import { Suspense } from "react";
import { APP_NAME } from "@/lib/constants";
import { ExerciseList } from "@/features/exercises/components/exercise-list";
import { ExerciseFilters } from "@/features/exercises/components/exercise-filters";

export const metadata = { title: `Exercises — ${APP_NAME}` };

export default function ExercisesPage() {
  return (
    <div className="space-y-4">
      <Suspense>
        <ExerciseFilters />
        <ExerciseList />
      </Suspense>
    </div>
  );
}
