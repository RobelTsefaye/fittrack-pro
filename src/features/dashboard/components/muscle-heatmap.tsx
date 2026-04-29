"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n-provider";
import type { MuscleHeatEntry } from "@/services/muscle-heatmap";
import type { MuscleGroup } from "@/generated/prisma/client";

// ─── Intensity → CSS opacity (primary color overlay) ─────────────────────────

function intensityToOpacity(intensity: number): number {
  if (intensity <= 0) return 0.06;
  // low → medium → high: 0.18 → 0.55 → 0.92
  return 0.18 + intensity * 0.74;
}

// ─── SVG region definitions ───────────────────────────────────────────────────
// ViewBox: 0 0 180 315

// Front muscle regions
const FRONT_REGIONS: { id: MuscleGroup; label: string; path: string }[] = [
  {
    id: "SHOULDERS",
    label: "Shoulders",
    path: "M48,68 C38,68 28,73 28,82 C28,91 38,96 48,96 C58,96 68,91 68,82 C68,73 58,68 48,68 Z M132,68 C122,68 112,73 112,82 C112,91 122,96 132,96 C142,96 152,91 152,82 C152,73 142,68 132,68 Z",
  },
  {
    id: "CHEST",
    label: "Chest",
    path: "M66,60 Q90,55 114,60 L112,106 Q90,112 68,106 Z",
  },
  {
    id: "BICEPS",
    label: "Biceps",
    path: "M24,84 L42,84 L43,128 L23,128 Z",
  },
  {
    id: "FOREARMS",
    label: "Forearms",
    path: "M22,130 L42,130 L44,174 L21,174 Z M138,130 L158,130 L159,174 L136,174 Z",
  },
  {
    id: "CORE",
    label: "Core",
    path: "M68,108 L112,108 L110,162 Q90,166 70,162 Z",
  },
  {
    id: "LEGS",
    label: "Quads",
    path: "M68,166 L90,166 L89,238 L66,238 Z M90,166 L112,166 L114,238 L91,238 Z",
  },
  {
    id: "CALVES",
    label: "Calves",
    path: "M67,241 L88,241 L87,305 L64,305 Z M92,241 L113,241 L115,305 L91,305 Z",
  },
];

const BACK_REGIONS: { id: MuscleGroup; label: string; path: string }[] = [
  {
    id: "SHOULDERS",
    label: "Rear Delts",
    path: "M48,68 C38,68 28,73 28,82 C28,91 38,96 48,96 C58,96 68,91 68,82 C68,73 58,68 48,68 Z M132,68 C122,68 112,73 112,82 C112,91 122,96 132,96 C142,96 152,91 152,82 C152,73 142,68 132,68 Z",
  },
  {
    id: "BACK",
    label: "Back",
    path: "M66,60 Q90,55 114,60 L112,152 Q90,157 68,152 Z",
  },
  {
    id: "TRICEPS",
    label: "Triceps",
    path: "M138,84 L156,84 L157,128 L137,128 Z",
  },
  {
    id: "FOREARMS",
    label: "Forearms",
    path: "M22,130 L42,130 L44,174 L21,174 Z M138,130 L158,130 L159,174 L136,174 Z",
  },
  {
    id: "GLUTES",
    label: "Glutes",
    path: "M68,154 Q90,160 112,154 L110,192 Q90,198 70,192 Z",
  },
  {
    id: "LEGS",
    label: "Hamstrings",
    path: "M69,196 L90,196 L89,238 L67,238 Z M91,196 L112,196 L114,238 L90,238 Z",
  },
  {
    id: "CALVES",
    label: "Calves",
    path: "M67,241 L88,241 L87,305 L64,305 Z M92,241 L113,241 L115,305 L91,305 Z",
  },
];

// ─── Body outline (static, always shown) ─────────────────────────────────────

const BODY_OUTLINE = `
M90,8 C80,8 72,16 72,26 C72,36 80,44 90,44 C100,44 108,36 108,26 C108,16 100,8 90,8 Z
M84,44 L80,56 Q66,58 63,60 L63,168 Q68,172 90,174 Q112,172 117,168 L117,60 Q114,58 100,56 L96,44 Z
M20,82 L63,68 L63,168 L20,168 Z
M160,82 L117,68 L117,168 L160,168 Z
M20,82 L20,176 L44,176 L63,168 Z
M160,82 L160,176 L136,176 L117,168 Z
M44,176 L44,240 L67,240 L63,168 Z
M136,176 L136,240 L113,240 L117,168 Z
M64,240 L67,308 L88,308 L89,240 Z
M116,240 L113,308 L92,308 L91,240 Z
`;

// ─── Component ───────────────────────────────────────────────────────────────

interface MuscleHeatmapProps {
  data: MuscleHeatEntry[];
  weightUnit?: string;
}

export function MuscleHeatmap({ data, weightUnit = "kg" }: MuscleHeatmapProps) {
  const { t } = useI18n();
  const [view, setView] = useState<"front" | "back">("front");
  const [hovered, setHovered] = useState<MuscleGroup | null>(null);

  const volumeMap = new Map(data.map((d) => [d.muscleGroup, d]));
  const regions = view === "front" ? FRONT_REGIONS : BACK_REGIONS;

  const hoveredEntry = hovered ? volumeMap.get(hovered) : null;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* View toggle */}
      <div className="flex rounded-xl overflow-hidden border border-[var(--sys-separator)]">
        {(["front", "back"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={cn(
              "px-5 py-1.5 text-sm font-semibold transition-colors",
              view === v
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-[var(--sys-label2)] hover:bg-[var(--sys-fill)]"
            )}
          >
            {t(v === "front" ? "muscleMap.front" : "muscleMap.back")}
          </button>
        ))}
      </div>

      {/* SVG body map */}
      <div className="relative flex flex-col items-center">
        <svg
          viewBox="0 0 180 315"
          className="w-full max-w-[200px]"
          aria-label="Muscle heatmap"
        >
          {/* Body outline — very faint */}
          <path
            d={BODY_OUTLINE}
            fill="var(--sys-fill2)"
            stroke="var(--sys-separator)"
            strokeWidth="0.5"
          />

          {/* Muscle regions */}
          {regions.map(({ id, path }) => {
            const entry   = volumeMap.get(id);
            const intensity = entry?.intensity ?? 0;
            const opacity   = intensityToOpacity(intensity);
            const isHov     = hovered === id;

            return (
              <path
                key={id}
                d={path}
                fill={`oklch(var(--primary-l, 0.205) var(--primary-c, 0) var(--primary-h, 0) / ${opacity})`}
                style={{
                  fill: `color-mix(in oklch, var(--primary) ${Math.round(opacity * 100)}%, transparent)`,
                  filter: isHov ? "brightness(1.15)" : undefined,
                  transition: "fill 300ms ease, filter 150ms ease",
                  cursor: entry ? "pointer" : "default",
                }}
                onMouseEnter={() => setHovered(id)}
                onMouseLeave={() => setHovered(null)}
                onTouchStart={() => setHovered(id)}
                onTouchEnd={() => setTimeout(() => setHovered(null), 1200)}
              />
            );
          })}
        </svg>

        {/* Tooltip */}
        <div
          className={cn(
            "mt-2 h-10 flex items-center justify-center transition-opacity duration-200",
            hovered ? "opacity-100" : "opacity-0"
          )}
        >
          {hoveredEntry ? (
            <div className="rounded-xl bg-[var(--card)] px-4 py-2 shadow-md text-sm">
              <span className="font-semibold">
                {t(`muscleMap.${hoveredEntry.muscleGroup}` as Parameters<typeof t>[0])}
              </span>
              <span className="ml-2 text-[var(--sys-label2)]">
                {Math.round(hoveredEntry.volume).toLocaleString()} {weightUnit}
              </span>
            </div>
          ) : hovered ? (
            <div className="rounded-xl bg-[var(--card)] px-4 py-2 shadow-md text-sm text-[var(--sys-label3)]">
              {t(`muscleMap.${hovered}` as Parameters<typeof t>[0])} — no data
            </div>
          ) : null}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 text-xs text-[var(--sys-label3)]">
        <div className="flex items-center gap-1">
          <div className="h-3 w-8 rounded-full" style={{ background: "linear-gradient(to right, color-mix(in oklch, var(--primary) 12%, transparent), color-mix(in oklch, var(--primary) 90%, transparent))" }} />
        </div>
        <span>low → high volume</span>
      </div>
    </div>
  );
}
