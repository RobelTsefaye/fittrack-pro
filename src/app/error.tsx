"use client"; // Error boundaries must be Client Components

import { ErrorView } from "@/components/error-view";

export default function RootError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorView error={error} retry={unstable_retry} homeHref="/" homeLabelKey="errorPage.goHome" />
  );
}
