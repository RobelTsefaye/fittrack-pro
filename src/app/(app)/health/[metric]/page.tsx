import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { MetricDetail } from "@/features/health/components/metric-detail";
import { getHealthSnapshots } from "@/features/health/health-data";
import { METRICS, METRIC_SLUGS, type MetricSlug } from "@/features/health/metric-config";

export async function generateMetadata({ params }: { params: Promise<{ metric: string }> }) {
  const { metric } = await params;
  const config = METRICS[metric as MetricSlug];
  return { title: config ? `${config.label} — ${APP_NAME}` : APP_NAME };
}

export default async function MetricPage({ params }: { params: Promise<{ metric: string }> }) {
  const { metric } = await params;
  if (!METRIC_SLUGS.includes(metric as MetricSlug)) notFound();

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const snapshots = await getHealthSnapshots(session.user.id, 90);
  return <MetricDetail slug={metric as MetricSlug} initialSnapshots={snapshots} />;
}
