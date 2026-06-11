"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n-provider";
import type { MuscleHeatEntry } from "@/services/muscle-heatmap";
import type { MuscleGroup } from "@/generated/prisma/client";

// ─── Intensity → opacity ──────────────────────────────────────────────────────

function intensityToOpacity(intensity: number): number {
  if (intensity <= 0) return 0;
  return 0.25 + intensity * 0.7;
}

// ─── Anatomical figure (200 × 440 viewBox) ────────────────────────────────────
// Drawn as an anatomy chart: a neutral body silhouette plus individual muscle
// bellies per group. Regions always render with a faint base fill so the
// figure reads as real anatomy even with no training data; heat colours them.

const BODY_SILHOUETTE = `
M 92,40
C 92,49 90,54 85,57
C 68,60 54,63 45,69
C 35,76 29,86 27,98
C 23,114 20,133 19,149
C 16,167 14,187 15,203
L 16,212
C 16,220 19,226 24,227
C 29,228 32,222 32,214
L 33,203
C 34,187 36,169 39,155
C 42,141 45,127 47,117
C 52,122 57,128 59,136
C 62,154 63,172 61,188
C 59,200 59,212 62,224
C 59,248 58,276 61,302
C 61,332 62,366 65,394
C 65,404 63,411 67,415
L 87,415
C 91,411 90,402 89,395
L 89,391
C 91,364 92,336 91,314
C 91,294 93,266 96,242
C 97,232 99,226 100,222
C 101,226 103,232 104,242
C 107,266 109,294 109,314
C 108,336 109,364 111,391
L 111,395
C 110,402 109,411 113,415
L 133,415
C 137,411 135,404 135,394
C 138,366 139,332 139,302
C 142,276 141,248 138,224
C 141,212 141,200 139,188
C 137,172 138,154 141,136
C 143,128 148,122 153,117
C 155,127 158,141 161,155
C 164,169 166,187 167,203
L 168,214
C 168,222 171,228 176,227
C 181,226 184,220 184,212
L 185,203
C 186,187 184,167 181,149
C 180,133 177,114 173,98
C 171,86 165,76 155,69
C 146,63 132,60 115,57
C 110,54 108,49 108,40
Z
`;

// ─── Front view ───────────────────────────────────────────────────────────────

const FRONT_REGIONS: { id: MuscleGroup; path: string }[] = [
  {
    // Deltoids — rounded caps over the shoulder joint
    id: "SHOULDERS",
    path: `M 50,68 C 39,73 31,84 29,97 C 28,105 32,110 39,109
           C 47,107 53,99 56,89 C 58,81 57,72 50,68 Z
           M 150,68 C 161,73 169,84 171,97 C 172,105 168,110 161,109
           C 153,107 147,99 144,89 C 142,81 143,72 150,68 Z`,
  },
  {
    // Pectorals — two plates meeting at the sternum
    id: "CHEST",
    path: `M 60,72 C 55,84 55,100 61,110 C 69,119 85,122 96,118
           C 98,108 98,90 96,76 C 85,68 70,68 60,72 Z
           M 140,72 C 145,84 145,100 139,110 C 131,119 115,122 104,118
           C 102,108 102,90 104,76 C 115,68 130,68 140,72 Z`,
  },
  {
    // Biceps — visible belly on the front of the upper arm
    id: "BICEPS",
    path: `M 36,104 C 30,116 27,132 28,146 C 30,154 38,156 43,149
           C 48,141 50,126 48,115 C 46,106 41,101 36,104 Z
           M 164,104 C 170,116 173,132 172,146 C 170,154 162,156 157,149
           C 152,141 150,126 152,115 C 154,106 159,101 164,104 Z`,
  },
  {
    // Forearms
    id: "FOREARMS",
    path: `M 24,154 C 20,168 17,188 18,202 C 19,210 26,212 30,206
           C 34,198 36,180 34,166 C 33,157 28,151 24,154 Z
           M 176,154 C 180,168 183,188 182,202 C 181,210 174,212 170,206
           C 166,198 164,180 166,166 C 167,157 172,151 176,154 Z`,
  },
  {
    // Abs panel + oblique flanks
    id: "CORE",
    path: `M 80,124 C 76,144 75,170 78,192 C 83,201 91,205 100,205
           C 109,205 117,201 122,192 C 125,170 124,144 120,124
           C 114,118 107,116 100,116 C 93,116 86,118 80,124 Z
           M 70,128 C 66,146 66,170 70,188 C 72,190 74,191 75,190
           C 72,170 72,146 75,128 C 74,126 72,126 70,128 Z
           M 130,128 C 134,146 134,170 130,188 C 128,190 126,191 125,190
           C 128,170 128,146 125,128 C 126,126 128,126 130,128 Z`,
  },
  {
    // Quadriceps
    id: "LEGS",
    path: `M 65,226 C 61,250 60,276 63,298 C 65,310 73,316 83,313
           C 91,310 95,301 96,289 C 97,264 95,240 91,224
           C 82,218 71,219 65,226 Z
           M 135,226 C 139,250 140,276 137,298 C 135,310 127,316 117,313
           C 109,310 105,301 104,289 C 103,264 105,240 109,224
           C 118,218 129,219 135,226 Z`,
  },
  {
    // Lower leg (tibialis + calf edges visible from the front)
    id: "CALVES",
    path: `M 66,318 C 63,338 63,364 67,384 C 69,393 76,395 81,389
           C 85,381 86,360 85,343 C 84,329 79,318 74,315 C 70,313 67,314 66,318 Z
           M 134,318 C 137,338 137,364 133,384 C 131,393 124,395 119,389
           C 115,381 114,360 115,343 C 116,329 121,318 126,315 C 130,313 133,314 134,318 Z`,
  },
];

const FRONT_DETAIL_LINES = [
  // Clavicles
  "M 62,66 C 74,62 88,60 99,61",
  "M 138,66 C 126,62 112,60 101,61",
  // Sternum
  "M 100,68 L 100,114",
  // Pec underside
  "M 62,108 C 72,115 86,118 96,116",
  "M 138,108 C 128,115 114,118 104,116",
  // Ab rows
  "M 79,136 Q 100,140 121,136",
  "M 78,156 Q 100,160 122,156",
  "M 78,176 Q 100,180 122,176",
  "M 100,118 L 100,200",
  // Oblique cuts
  "M 72,150 C 75,162 75,176 73,186",
  "M 128,150 C 125,162 125,176 127,186",
  // Quad sweep + kneecap
  "M 79,232 C 80,260 80,288 79,306",
  "M 121,232 C 120,260 120,288 121,306",
  "M 74,306 a 6 7 0 1 0 12 0",
  "M 114,306 a 6 7 0 1 0 12 0",
  // Tibia line
  "M 76,322 C 75,346 75,370 76,388",
  "M 124,322 C 125,346 125,370 124,388",
];

// ─── Back view ────────────────────────────────────────────────────────────────

const BACK_REGIONS: { id: MuscleGroup; path: string }[] = [
  {
    id: "SHOULDERS",
    path: `M 50,68 C 39,73 31,84 29,97 C 28,105 32,110 39,109
           C 47,107 53,99 56,89 C 58,81 57,72 50,68 Z
           M 150,68 C 161,73 169,84 171,97 C 172,105 168,110 161,109
           C 153,107 147,99 144,89 C 142,81 143,72 150,68 Z`,
  },
  {
    // Trapezius (diamond) + latissimus (wings) + erectors
    id: "BACK",
    path: `M 100,58 C 90,61 75,66 64,72 C 76,78 90,86 96,100
           L 100,128 L 104,100 C 110,86 124,78 136,72
           C 125,66 110,61 100,58 Z
           M 62,96 C 58,116 60,142 68,160 C 76,174 90,182 97,184
           L 98,134 C 88,120 74,104 62,96 Z
           M 138,96 C 142,116 140,142 132,160 C 124,174 110,182 103,184
           L 102,134 C 112,120 126,104 138,96 Z
           M 92,140 L 92,196 C 95,200 105,200 108,196 L 108,140
           C 105,136 95,136 92,140 Z`,
  },
  {
    id: "TRICEPS",
    path: `M 33,106 C 28,118 25,134 26,147 C 27,155 34,157 39,151
           C 44,144 46,129 44,117 C 42,108 38,103 33,106 Z
           M 167,106 C 172,118 175,134 174,147 C 173,155 166,157 161,151
           C 156,144 154,129 156,117 C 158,108 162,103 167,106 Z`,
  },
  {
    id: "FOREARMS",
    path: `M 24,154 C 20,168 17,188 18,202 C 19,210 26,212 30,206
           C 34,198 36,180 34,166 C 33,157 28,151 24,154 Z
           M 176,154 C 180,168 183,188 182,202 C 181,210 174,212 170,206
           C 166,198 164,180 166,166 C 167,157 172,151 176,154 Z`,
  },
  {
    // Glutes
    id: "GLUTES",
    path: `M 67,202 C 60,212 58,228 62,240 C 66,251 78,255 88,250
           C 96,245 99,234 97,222 C 95,210 87,202 78,199 C 73,198 70,199 67,202 Z
           M 133,202 C 140,212 142,228 138,240 C 134,251 122,255 112,250
           C 104,245 101,234 103,222 C 105,210 113,202 122,199 C 127,198 130,199 133,202 Z`,
  },
  {
    // Hamstrings
    id: "LEGS",
    path: `M 64,256 C 61,276 61,294 64,306 C 67,316 76,319 84,314
           C 91,310 94,300 94,288 C 94,272 92,260 89,252
           C 80,248 70,249 64,256 Z
           M 136,256 C 139,276 139,294 136,306 C 133,316 124,319 116,314
           C 109,310 106,300 106,288 C 106,272 108,260 111,252
           C 120,248 130,249 136,256 Z`,
  },
  {
    // Gastrocnemius
    id: "CALVES",
    path: `M 65,320 C 61,340 62,366 67,384 C 70,393 78,395 83,388
           C 87,380 88,358 86,341 C 84,327 79,316 73,314 C 68,313 66,315 65,320 Z
           M 135,320 C 139,340 138,366 133,384 C 130,393 122,395 117,388
           C 113,380 112,358 114,341 C 116,327 121,316 127,314 C 132,313 134,315 135,320 Z`,
  },
];

const BACK_DETAIL_LINES = [
  // Spine
  "M 100,60 L 100,198",
  // Trap ridge
  "M 70,74 C 82,80 92,90 97,102",
  "M 130,74 C 118,80 108,90 103,102",
  // Lat sweep
  "M 66,104 C 72,124 82,142 95,152",
  "M 134,104 C 128,124 118,142 105,152",
  // Glute fold
  "M 66,244 C 76,250 88,252 96,248",
  "M 134,244 C 124,250 112,252 104,248",
  // Hamstring split
  "M 79,258 C 79,278 79,296 78,310",
  "M 121,258 C 121,278 121,296 122,310",
  // Calf inner/outer head split
  "M 76,322 C 75,342 76,362 77,380",
  "M 124,322 C 125,342 124,362 123,380",
  // Knee fold
  "M 72,312 Q 79,316 88,313",
  "M 128,312 Q 121,316 112,313",
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
  const detailLines = view === "front" ? FRONT_DETAIL_LINES : BACK_DETAIL_LINES;
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
        viewBox="0 0 200 440"
        className="w-full max-w-[170px]"
        aria-label="Muscle heatmap"
        style={{ overflow: "visible" }}
      >
        {/* ── Head (neutral, no face) ───────────────────────── */}
        <path
          d="M 84,26 C 84,12 91,5 100,5 C 109,5 116,12 116,26
             C 116,37 110,46 100,46 C 90,46 84,37 84,26 Z"
          fill="var(--card)"
          stroke="var(--sys-separator)"
          strokeWidth="1.4"
        />
        {/* Neck */}
        <path
          d="M 92,40 C 92,49 90,54 85,57 L 115,57 C 110,54 108,49 108,40 Z"
          fill="var(--card)"
          stroke="var(--sys-separator)"
          strokeWidth="1"
        />

        {/* ── Body silhouette ───────────────────────────────── */}
        <path
          d={BODY_SILHOUETTE}
          fill="var(--card)"
          stroke="var(--sys-separator)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />

        {/* ── Muscle bellies (always visible base + heat) ───── */}
        {regions.map(({ id, path }) => {
          const entry     = volumeMap.get(id);
          const intensity = entry?.intensity ?? 0;
          const opacity   = intensityToOpacity(intensity);
          const isHov     = hovered === id;

          return (
            <g key={id}>
              {/* Base anatomy fill — keeps the chart readable at zero heat */}
              <path
                d={path}
                fill="var(--sys-fill)"
                stroke="var(--sys-separator)"
                strokeWidth="0.9"
                strokeLinejoin="round"
              />
              {/* Heat overlay */}
              <path
                d={path}
                style={{
                  fill: opacity > 0
                    ? `color-mix(in oklch, var(--primary) ${Math.round(opacity * 100)}%, transparent)`
                    : "transparent",
                  filter: isHov
                    ? "brightness(1.18) drop-shadow(0 0 5px color-mix(in oklch, var(--primary) 55%, transparent))"
                    : undefined,
                  transition: "fill 300ms ease, filter 140ms ease",
                  cursor: entry ? "pointer" : "default",
                }}
                onMouseEnter={() => setHovered(id)}
                onMouseLeave={() => setHovered(null)}
                onTouchStart={() => setHovered(id)}
                onTouchEnd={() => setTimeout(() => setHovered(null), 1400)}
              />
            </g>
          );
        })}

        {/* ── Anatomical detail lines ───────────────────────── */}
        {detailLines.map((d, i) => (
          <path
            key={i}
            d={d}
            stroke="var(--sys-separator)"
            strokeWidth="0.8"
            fill="none"
            strokeLinecap="round"
            opacity="0.55"
            style={{ pointerEvents: "none" }}
          />
        ))}
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
              <span className="ml-2 text-[var(--sys-label3)]">–</span>
            )}
          </div>
        )}
      </div>

      {/* Colour legend */}
      <div className="flex items-center gap-2.5 text-[0.6875rem] text-[var(--sys-label3)]">
        <span>{t("muscleMap.none")}</span>
        <div
          className="h-2.5 w-24 rounded-full"
          style={{
            background:
              "linear-gradient(to right, color-mix(in oklch, var(--primary) 20%, transparent), color-mix(in oklch, var(--primary) 94%, transparent))",
          }}
        />
        <span>{t("muscleMap.high")}</span>
      </div>
    </div>
  );
}
