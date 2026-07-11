import { METRIC_SLUGS } from "@/features/health/metric-config";
import { MetricPageClient } from "./page-client";

// `generateStaticParams` must live in a Server Component file — it can't be
// exported alongside "use client". All real metric slugs are known at build
// time (unlike workout/exercise/plan ids), so list them all instead of a
// single placeholder — every valid /health/<slug> path gets its own
// pre-rendered shell (project-docs/offline-first-roadmap.md Phase 2).
export function generateStaticParams() {
  return METRIC_SLUGS.map((metric) => ({ metric }));
}

export default function MetricPage() {
  return <MetricPageClient />;
}
