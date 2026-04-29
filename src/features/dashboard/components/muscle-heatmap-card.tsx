import { getMuscleVolumeLastDays } from "@/services/muscle-heatmap";
import { prisma } from "@/lib/prisma";
import { MuscleHeatmap } from "./muscle-heatmap";

interface MuscleHeatmapCardProps {
  userId: string;
}

export async function MuscleHeatmapCard({ userId }: MuscleHeatmapCardProps) {
  const [data, settings] = await Promise.all([
    getMuscleVolumeLastDays(userId, 7),
    prisma.userSettings.findUnique({
      where: { userId },
      select: { weightUnit: true },
    }),
  ]);

  const unit = (settings?.weightUnit ?? "KG").toLowerCase();

  return (
    <div className="ios-group px-4 py-4 space-y-1">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[0.9375rem] font-semibold">Muscle Map</h2>
        <span className="text-xs text-[var(--sys-label3)]">Last 7 days</span>
      </div>
      {data.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--sys-label3)]">
          Complete a workout to see your muscle map.
        </p>
      ) : (
        <MuscleHeatmap data={data} weightUnit={unit} />
      )}
    </div>
  );
}
