/** Skeleton shown while dashboard data streams (loading.tsx + Suspense). */
export function DashboardPageSkeleton() {
  return (
    <div className="space-y-8 animate-pulse" aria-hidden>
      <div className="space-y-2">
        <div className="h-8 max-w-[14rem] rounded-md bg-muted/50" />
        <div className="h-4 max-w-[18rem] rounded-md bg-muted/35" />
      </div>
      <div className="h-28 rounded-xl bg-muted/45" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted/45" />
        ))}
      </div>
      <div className="space-y-6">
        <div className="h-44 rounded-xl bg-muted/40" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-72 rounded-xl bg-muted/40" />
          <div className="h-72 rounded-xl bg-muted/40" />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="h-48 rounded-xl bg-muted/40" />
          <div className="h-48 rounded-xl bg-muted/40" />
          <div className="h-48 rounded-xl bg-muted/40" />
        </div>
        <div className="h-56 rounded-xl bg-muted/40" />
      </div>
    </div>
  );
}
