/** Generic route-level loading skeleton (used by loading.tsx files). */
export function PageSkeleton({
  blocks = [32, 48, 48],
}: {
  /** Heights (in tailwind units of 0.25rem) for the placeholder cards. */
  blocks?: number[];
}) {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden>
      <div className="space-y-2">
        <div className="h-8 max-w-[12rem] rounded-md bg-muted/50" />
        <div className="h-4 max-w-[16rem] rounded-md bg-muted/35" />
      </div>
      {blocks.map((h, i) => (
        <div
          key={i}
          className="rounded-[22px] bg-muted/40"
          style={{ height: `${h * 0.25}rem` }}
        />
      ))}
    </div>
  );
}
