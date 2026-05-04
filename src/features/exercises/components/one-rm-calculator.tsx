"use client";

import { useState } from "react";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";

function epley(weight: number, reps: number) {
  if (reps < 1 || weight <= 0) return 0;
  return weight * (1 + reps / 30);
}

// Percentage of 1RM for each rep count (Prilepin / general)
const REP_PERCENTAGES: [number, number][] = [
  [1, 100], [2, 97], [3, 94], [4, 92], [5, 89],
  [6, 86], [8, 81], [10, 75], [12, 70], [15, 65],
];

interface OneRMCalculatorProps {
  /** Pre-fill from best PR if available */
  initialWeight?: number;
  initialReps?: number;
  weightUnit: "KG" | "LB";
}

export function OneRMCalculator({ initialWeight = 0, initialReps = 5, weightUnit }: OneRMCalculatorProps) {
  const [weight, setWeight] = useState(initialWeight > 0 ? initialWeight : 0);
  const [reps, setReps] = useState(initialReps);

  const unit = weightUnit.toLowerCase();
  const oneRM = epley(weight, reps);

  return (
    <div className="ios-group overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-[var(--sys-separator)]">
        <Target className="h-4 w-4 text-primary shrink-0" />
        <h3 className="text-[0.9rem] font-semibold">1RM Calculator</h3>
      </div>

      {/* Inputs */}
      <div className="flex gap-4 px-4 py-4">
        <label className="flex-1">
          <span className="block text-[0.68rem] font-semibold uppercase tracking-wider text-[var(--sys-label3)] mb-1.5">
            Weight ({unit})
          </span>
          <input
            type="number"
            min={0}
            step={2.5}
            value={weight || ""}
            onChange={(e) => setWeight(parseFloat(e.target.value) || 0)}
            placeholder="0"
            className="w-full rounded-xl border border-[var(--sys-separator)] bg-[var(--sys-fill)] px-3 py-2.5 text-[0.95rem] font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </label>
        <label className="w-24">
          <span className="block text-[0.68rem] font-semibold uppercase tracking-wider text-[var(--sys-label3)] mb-1.5">
            Reps
          </span>
          <input
            type="number"
            min={1}
            max={30}
            step={1}
            value={reps}
            onChange={(e) => setReps(parseInt(e.target.value) || 1)}
            className="w-full rounded-xl border border-[var(--sys-separator)] bg-[var(--sys-fill)] px-3 py-2.5 text-[0.95rem] font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </label>
      </div>

      {/* Result */}
      {oneRM > 0 && (
        <div className="px-4 pb-4 space-y-3">
          <div className="rounded-xl bg-primary/8 px-4 py-3 flex items-baseline justify-between">
            <span className="text-[0.78rem] font-semibold text-primary/80 uppercase tracking-wide">
              Estimated 1RM
            </span>
            <span className="text-[1.6rem] font-bold text-primary leading-none">
              {Math.round(oneRM)} <span className="text-[0.85rem] font-semibold">{unit}</span>
            </span>
          </div>

          {/* Percentage table */}
          <div className="rounded-xl border border-[var(--sys-separator)] overflow-hidden">
            <div className="grid grid-cols-3 bg-[var(--sys-fill)] px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-wider text-[var(--sys-label3)]">
              <span>% 1RM</span>
              <span className="text-center">Reps</span>
              <span className="text-right">Weight</span>
            </div>
            {REP_PERCENTAGES.map(([repCount, pct]) => (
              <div
                key={repCount}
                className={cn(
                  "grid grid-cols-3 items-center px-3 py-2 border-t border-[var(--sys-separator)] text-[0.78rem]",
                  repCount === reps ? "bg-primary/6 font-semibold" : ""
                )}
              >
                <span className={cn("text-[var(--sys-label2)]", repCount === reps && "text-primary")}>
                  {pct}%
                </span>
                <span className={cn("text-center text-[var(--sys-label2)]", repCount === reps && "text-primary")}>
                  {repCount}
                </span>
                <span className={cn("text-right font-medium", repCount === reps && "text-primary")}>
                  {Math.round((pct / 100) * oneRM)} {unit}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
