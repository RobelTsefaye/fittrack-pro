/** Matches WorkoutHistoryList header + list skeleton for streaming. */
export function WorkoutsPageSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-40 animate-pulse rounded-md bg-muted/60" />
          <div className="h-4 w-56 animate-pulse rounded-md bg-muted/40" />
        </div>
        <div className="h-10 w-full animate-pulse rounded-md bg-muted/50 sm:w-40" />
      </div>
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/45" />
        ))}
      </div>
    </div>
  );
}
