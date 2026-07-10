"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { RequireAuth } from "@/components/auth/require-auth";
import { APP_NAME } from "@/lib/constants";
import { MetricDetail } from "@/features/health/components/metric-detail";
import { METRICS, METRIC_SLUGS, type MetricSlug } from "@/features/health/metric-config";

// MetricDetail already falls back to its own client fetch of
// /api/health-data?limit=90 whenever `initialSnapshots` isn't provided, so
// simply not passing it here is enough — same pattern as ExercisesPage.
// `notFound()` becomes a redirect to the parent /health listing; the page
// <title> is set via effect instead of generateMetadata.
export function MetricPageClient() {
  const { metric } = useParams<{ metric: string }>();
  const router = useRouter();
  const isValid = METRIC_SLUGS.includes(metric as MetricSlug);

  useEffect(() => {
    if (!isValid) router.replace("/health");
  }, [isValid, router]);

  useEffect(() => {
    const config = isValid ? METRICS[metric as MetricSlug] : undefined;
    document.title = config ? `${config.label} — ${APP_NAME}` : APP_NAME;
  }, [isValid, metric]);

  if (!isValid) return null;

  return (
    <RequireAuth>
      <MetricDetail slug={metric as MetricSlug} />
    </RequireAuth>
  );
}
