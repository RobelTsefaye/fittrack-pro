"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n-provider";
import type { MuscleHeatEntry } from "@/services/muscle-heatmap";
import type { MuscleGroup } from "@/generated/prisma/client";

// ─── Intensity → opacity ──────────────────────────────────────────────────────

function intensityToOpacity(intensity: number): number {
  if (intensity <= 0) return 0;
  return 0.22 + intensity * 0.72;
}

// ─── Realistic body SVG paths (200 × 430 viewBox) ────────────────────────────
//
// One continuous silhouette path traced from neck → left shoulder → left arm →
// left torso → left leg → feet → right leg → right torso → right arm → neck.
// Muscle-group regions are separate overlay paths inside the silhouette.

const BODY_SILHOUETTE = `
M 90,56
C 74,56 57,58 43,68 C 29,77 19,91 15,108
L 11,152 C 9,164 9,176 13,188 L 17,228
C 18,236 18,244 18,252 L 14,270
C 13,276 12,282 14,286 C 16,290 20,290 22,286
C 24,282 24,276 22,272 L 22,256
C 22,248 23,240 25,232 L 29,192
C 31,184 34,178 38,174
L 37,192 C 35,204 33,218 33,232
L 35,304 C 36,312 38,320 41,326
L 41,378 C 41,384 43,390 49,393
L 71,393 C 77,394 81,392 83,388
C 84,384 85,378 85,374 L 85,312
C 85,302 85,294 87,284 L 91,248
C 92,238 96,232 100,230
C 104,232 108,238 109,248 L 113,284
C 115,294 115,302 115,312 L 115,374
C 115,378 116,384 117,388 C 119,392 123,394 129,393
L 151,393 C 157,390 159,384 159,378
L 159,326 C 162,320 164,312 165,304
L 167,232 C 167,218 165,204 163,192
L 162,174 C 166,178 169,184 171,192
L 175,232 C 177,240 177,248 178,256
L 178,272 C 176,276 176,282 178,286
C 180,290 184,290 186,286 C 188,282 187,276 186,270
L 182,252 C 182,244 182,236 183,228
L 187,188 C 191,176 191,164 189,152
L 185,108 C 181,91 171,77 157,68
C 143,58 126,56 110,56 Z
`;

// ─── Front-view muscle regions ────────────────────────────────────────────────

const FRONT_REGIONS: { id: MuscleGroup; path: string }[] = [
  {
    id: "SHOULDERS",
    path: `M 15,102 C 11,110 11,122 15,132 C 19,140 27,144 35,142
           C 42,140 46,132 44,122 C 42,112 36,106 28,102
           C 22,98 17,98 15,102 Z
           M 185,102 C 189,110 189,122 185,132 C 181,140 173,144 165,142
           C 158,140 154,132 156,122 C 158,112 164,106 172,102
           C 178,98 183,98 185,102 Z`,
  },
  {
    id: "CHEST",
    path: `M 43,70 C 57,65 78,62 100,62 C 122,62 143,65 157,70
           L 154,126 Q 100,133 46,126 Z`,
  },
  {
    id: "BICEPS",
    path: `M 11,136 L 27,132 L 28,174 L 12,177 Z
           M 189,136 L 173,132 L 172,174 L 188,177 Z`,
  },
  {
    id: "FOREARMS",
    path: `M 12,179 L 27,176 L 28,228 L 13,231 Z
           M 188,179 L 173,176 L 172,228 L 187,231 Z`,
  },
  {
    id: "CORE",
    path: `M 46,128 Q 100,135 154,128 L 151,192 Q 100,200 49,192 Z`,
  },
  {
    id: "LEGS",
    path: `M 49,240 L 83,240 L 82,312 L 47,312 Z
           M 117,240 L 151,240 L 153,312 L 118,312 Z`,
  },
  {
    id: "CALVES",
    path: `M 48,316 L 81,316 L 80,376 L 47,376 Z
           M 119,316 L 152,316 L 153,376 L 120,376 Z`,
  },
];

// ─── Back-view muscle regions ─────────────────────────────────────────────────

const BACK_REGIONS: { id: MuscleGroup; path: string }[] = [
  {
    id: "SHOULDERS",
    path: `M 15,102 C 11,110 11,122 15,132 C 19,140 27,144 35,142
           C 42,140 46,132 44,122 C 42,112 36,106 28,102
           C 22,98 17,98 15,102 Z
           M 185,102 C 189,110 189,122 185,132 C 181,140 173,144 165,142
           C 158,140 154,132 156,122 C 158,112 164,106 172,102
           C 178,98 183,98 185,102 Z`,
  },
  {
    id: "BACK",
    path: `M 43,70 C 57,65 78,62 100,62 C 122,62 143,65 157,70
           L 154,188 Q 100,196 46,188 Z`,
  },
  {
    id: "TRICEPS",
    path: `M 11,136 L 27,132 L 28,174 L 12,177 Z
           M 189,136 L 173,132 L 172,174 L 188,177 Z`,
  },
  {
    id: "FOREARMS",
    path: `M 12,179 L 27,176 L 28,228 L 13,231 Z
           M 188,179 L 173,176 L 172,228 L 187,231 Z`,
  },
  {
    id: "GLUTES",
    path: `M 46,192 Q 100,200 154,192 L 151,232 Q 100,240 49,232 Z`,
  },
  {
    id: "LEGS",
    path: `M 49,236 L 83,236 L 82,312 L 47,312 Z
           M 117,236 L 151,236 L 153,312 L 118,312 Z`,
  },
  {
    id: "CALVES",
    path: `M 48,316 L 81,316 L 80,376 L 47,376 Z
           M 119,316 L 152,316 L 153,376 L 120,376 Z`,
  },
];

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

      {/* Front / Back toggle */}
      <div className="flex rounded-xl overflow-hidden border border-[var(--sys-separator)]">
        {(["front", "back"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={cn(
              "px-6 py-1.5 text-sm font-semibold transition-colors",
              view === v
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-[var(--sys-label2)] hover:bg-[var(--sys-fill)]"
            )}
          >
            {t(v === "front" ? "muscleMap.front" : "muscleMap.back")}
          </button>
        ))}
      </div>

      {/* Body SVG */}
      <svg
        viewBox="0 0 200 430"
        className="w-full max-w-[160px]"
        aria-label="Muscle heatmap"
        style={{ overflow: "visible" }}
      >
        {/* Head */}
        <ellipse
          cx="100" cy="32" rx="24" ry="27"
          fill="var(--card)"
          stroke="var(--sys-separator)"
          strokeWidth="1.5"
        />
        {/* Face details — eyes + mouth for realism */}
        <ellipse cx="91" cy="29" rx="3" ry="3.5" fill="var(--sys-fill2)" />
        <ellipse cx="109" cy="29" rx="3" ry="3.5" fill="var(--sys-fill2)" />
        <path d="M 93,40 Q 100,44 107,40" stroke="var(--sys-separator)" strokeWidth="1.2" fill="none" strokeLinecap="round" />

        {/* Body silhouette */}
        <path
          d={BODY_SILHOUETTE}
          fill="var(--card)"
          stroke="var(--sys-separator)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Muscle region heat overlays */}
        {regions.map(({ id, path }) => {
          const entry     = volumeMap.get(id);
          const intensity = entry?.intensity ?? 0;
          const opacity   = intensityToOpacity(intensity);
          const isHov     = hovered === id;

          if (opacity <= 0 && !isHov) {
            // Still render an invisible hit-area for hover
            return (
              <path
                key={id}
                d={path}
                fill="transparent"
                onMouseEnter={() => setHovered(id)}
                onMouseLeave={() => setHovered(null)}
                onTouchStart={() => setHovered(id)}
                onTouchEnd={() => setTimeout(() => setHovered(null), 1400)}
                style={{ cursor: "default" }}
              />
            );
          }

          return (
            <path
              key={id}
              d={path}
              style={{
                fill: `color-mix(in oklch, var(--primary) ${Math.round(opacity * 100)}%, transparent)`,
                filter: isHov ? "brightness(1.2) drop-shadow(0 0 4px color-mix(in oklch, var(--primary) 60%, transparent))" : undefined,
                transition: "fill 350ms ease, filter 150ms ease",
                cursor: entry ? "pointer" : "default",
              }}
              onMouseEnter={() => setHovered(id)}
              onMouseLeave={() => setHovered(null)}
              onTouchStart={() => setHovered(id)}
              onTouchEnd={() => setTimeout(() => setHovered(null), 1400)}
            />
          );
        })}

        {/* Neck connector (drawn on top so it looks clean) */}
        <path
          d="M 88,56 L 112,56 L 111,72 L 89,72 Z"
          fill="var(--card)"
          stroke="var(--sys-separator)"
          strokeWidth="1"
        />
      </svg>

      {/* Tooltip */}
      <div className={cn(
        "h-9 flex items-center justify-center transition-opacity duration-200",
        hovered ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        {hovered && (
          <div className="rounded-xl bg-[var(--card)] px-4 py-2 shadow-lg ring-1 ring-[var(--sys-separator)] text-sm">
            <span className="font-semibold">
              {t(`muscleMap.${hovered}` as Parameters<typeof t>[0])}
            </span>
            {hoveredEntry ? (
              <span className="ml-2 text-[var(--sys-label2)]">
                {Math.round(hoveredEntry.volume).toLocaleString()} {weightUnit}
              </span>
            ) : (
              <span className="ml-2 text-[var(--sys-label3)]">no data</span>
            )}
          </div>
        )}
      </div>

      {/* Colour legend */}
      <div className="flex items-center gap-2.5 text-[0.6875rem] text-[var(--sys-label3)]">
        <span>none</span>
        <div
          className="h-2.5 w-24 rounded-full"
          style={{
            background: "linear-gradient(to right, color-mix(in oklch, var(--primary) 22%, transparent), color-mix(in oklch, var(--primary) 94%, transparent))",
          }}
        />
        <span>high</span>
      </div>
    </div>
  );
}
