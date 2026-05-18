import { notFound } from "next/navigation";
import { APP_NAME } from "@/lib/constants";
import { MetricDetail } from "@/features/health/components/metric-detail";
import { METRICS, METRIC_SLUGS, type MetricSlug } from "@/features/health/metric-config";

export async function generateMetadata({ params }: { params: Promise<{ metric: string }> }) {
  const { metric } = await params;
  const config = METRICS[metric as MetricSlug];
  return { title: config ? `${config.label} — ${APP_NAME}` : APP_NAME };
}

export default async function MetricPage({ params }: { params: Promise<{ metric: string }> }) {
  const { metric } = await params;
  if (!METRIC_SLUGS.includes(metric as MetricSlug)) notFound();
  return <MetricDetail slug={metric as MetricSlug} />;
}
