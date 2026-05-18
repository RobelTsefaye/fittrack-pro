"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface HealthStatPillProps {
  icon: ReactNode;
  label: string;
  value: string | null;
  unit?: string;
  accent?: string; // CSS color
  className?: string;
}

export function HealthStatPill({
  icon,
  label,
  value,
  unit,
  accent = "#D4FF3A",
  className,
}: HealthStatPillProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-2xl p-3.5",
        className
      )}
      style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center gap-1.5">
        <span style={{ color: accent }} className="text-[15px]">
          {icon}
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#9A9AA2" }}>
          {label}
        </span>
      </div>
      {value != null ? (
        <p className="text-[22px] font-bold leading-none text-white">
          {value}
          {unit && (
            <span className="ml-1 text-[13px] font-normal" style={{ color: "#9A9AA2" }}>
              {unit}
            </span>
          )}
        </p>
      ) : (
        <p className="text-[15px] font-medium" style={{ color: "#5E5E66" }}>—</p>
      )}
    </div>
  );
}
