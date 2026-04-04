import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { getCachedWorkoutsListPage } from "@/features/workouts/workouts-list-data";
import { WorkoutHistoryList } from "@/features/workouts/components/workout-history-list";
import { WorkoutsPageSkeleton } from "./workouts-page-skeleton";

export const metadata = { title: `Workouts — ${APP_NAME}` };

export default async function WorkoutsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <Suspense fallback={<WorkoutsPageSkeleton />}>
      <WorkoutsListBody userId={session.user.id} />
    </Suspense>
  );
}

async function WorkoutsListBody({ userId }: { userId: string }) {
  const { items } = await getCachedWorkoutsListPage(userId);
  return <WorkoutHistoryList initialWorkouts={items} />;
}
