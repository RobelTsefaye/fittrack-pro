import { Suspense } from "react";
import { APP_NAME } from "@/lib/constants";
import { WorkoutHistoryList } from "@/features/workouts/components/workout-history-list";

export const metadata = { title: `Workouts — ${APP_NAME}` };

export default function WorkoutsPage() {
  return (
    <Suspense fallback={<WorkoutHistoryListFallback />}>
      <WorkoutHistoryList />
    </Suspense>
  );
}

function WorkoutHistoryListFallback() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-40 animate-pulse rounded bg-muted" />
      <div className="h-24 animate-pulse rounded-xl bg-muted/80" />
    </div>
  );
}
