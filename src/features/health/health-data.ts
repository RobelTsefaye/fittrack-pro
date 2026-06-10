import { prisma } from "@/lib/prisma";
import type { HealthSnapshot } from "./types";

/**
 * Server-side fetch of recent health snapshots in the `GET /api/health-data`
 * shape (dates as ISO strings), so health pages can render without the
 * client fetch waterfall.
 */
export async function getHealthSnapshots(
  userId: string,
  limit = 30
): Promise<HealthSnapshot[]> {
  // Newest N, returned in ascending order (charts expect oldest → newest).
  const rows = await prisma.healthSnapshot.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: Math.min(limit, 365),
  });
  return JSON.parse(JSON.stringify(rows.reverse())) as HealthSnapshot[];
}
