"use client"; // Error boundaries must be Client Components

import { ErrorView } from "@/components/error-view";

// Liegt innerhalb des (app)-Layouts: Navigation (Sidebar/Tab-Bar) bleibt
// bestehen, nur der Seiteninhalt wird durch die Fehleransicht ersetzt.
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorView
      error={error}
      retry={unstable_retry}
      homeHref="/workouts"
      homeLabelKey="errorPage.goTraining"
    />
  );
}
