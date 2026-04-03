"use client";

import { cn } from "@/lib/utils";
import type { HeatmapColumn } from "@/features/dashboard/queries";

const levelClass = [
  "bg-muted/50",
  "bg-primary/25",
  "bg-primary/45",
  "bg-primary/65",
  "bg-primary/90",
];

export function WorkoutHeatmap({
  columns,
  lessLabel,
  moreLabel,
}: {
  columns: HeatmapColumn[];
  lessLabel: string;
  moreLabel: string;
}) {
  if (columns.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto pb-1 max-w-full">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-1 shrink-0">
            {col.map((cell, ri) => (
              <div
                key={ri}
                title={`${cell.date}: ${cell.count}`}
                className={cn(
                  "size-3 rounded-sm border border-border/40",
                  cell.inRange ? levelClass[cell.level] : "bg-transparent border-transparent"
                )}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
        <span>{lessLabel}</span>
        <div className="flex gap-0.5">
          {levelClass.slice(1).map((c, i) => (
            <div key={i} className={cn("size-3 rounded-sm border border-border/40", c)} />
          ))}
        </div>
        <span>{moreLabel}</span>
      </div>
    </div>
  );
}
