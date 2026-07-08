import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/lib/auth";
import { getWorkoutsListUncached } from "@/features/workouts/workouts-list-data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Fetched server-side so ActiveWorkoutBanner can render with the right
  // state on first paint instead of popping in after a client fetch
  // resolves — that pop-in shifted every list below it (e.g. the "Mehr"
  // page) right as a tap was landing, causing the wrong row to register the
  // click. See ActiveWorkoutBanner's `initialActive` prop.
  const session = await auth();
  const initialActive = session?.user?.id
    ? (await getWorkoutsListUncached(session.user.id, 1, 1, "active")).items[0] ?? null
    : null;

  return <AppShell initialActiveWorkout={initialActive}>{children}</AppShell>;
}
