"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n-provider";
import type { MuscleHeatEntry } from "@/services/muscle-heatmap";
import type { MuscleGroup } from "@/generated/prisma/client";

// ─── Intensity → opacity ──────────────────────────────────────────────────────

function intensityToOpacity(intensity: number): number {
  if (intensity <= 0) return 0;
  return 0.20 + intensity * 0.74;
}

// ─── Athletic body silhouette (200 × 430 viewBox) ────────────────────────────
//
// Traced clockwise: neck-left → left shoulder → left arm (outer→hand→inner) →
// armpit → left torso → left outer leg → left foot → left inner leg → crotch →
// right inner leg → right foot → right outer leg → right torso →
// right armpit → right arm → right shoulder → neck-right → close.

const BODY_SILHOUETTE = `
M 86,57
C 70,57 44,62 24,75 C 14,82 8,94 7,108
L 7,165 C 6,172 8,180 12,185
L 14,234 C 14,240 17,244 21,244
C 24,244 27,240 27,234
L 29,185 C 33,179 35,172 36,165
L 37,110 C 39,103 42,97 45,94
C 48,148 48,178 46,202 C 44,220 42,236 42,246
L 39,330 L 38,402
C 38,410 42,416 52,416 C 62,416 66,410 66,402
L 67,330 C 68,298 69,272 72,254
C 78,252 92,251 100,251 C 108,251 122,252 128,254
C 131,272 132,298 133,330 L 134,402
C 134,410 138,416 148,416 C 158,416 162,410 162,402
L 161,330 C 160,298 158,264 158,246
C 158,236 156,220 154,202 C 152,178 152,148 155,94
C 158,97 161,103 163,110
L 164,165 C 165,172 167,179 171,185
L 173,234 C 173,240 176,244 180,244
C 184,244 186,240 186,234
L 188,185 C 192,180 194,172 193,165
L 193,108 C 192,94 186,82 176,75 C 156,62 130,57 114,57 Z
`;

// ─── Anatomical detail lines (non-interactive, visual only) ──────────────────

const FRONT_DETAIL_LINES = [
  // Sternum / chest center divide
  "M 100,94 L 100,128",
  // Ab vertical center
  "M 100,130 L 100,204",
  // Ab horizontal bands
  "M 64,150 Q 100,153 136,150",
  "M 63,172 Q 100,175 137,172",
  "M 62,194 Q 100,197 138,194",
  // Quad separation (VMO/rectus divide)
  "M 52,258 C 53,290 52,318 52,328",
  "M 148,258 C 147,290 148,318 148,328",
];

const BACK_DETAIL_LINES = [
  // Spine
  "M 100,84 L 100,222",
  // Trap / upper back separations
  "M 72,92 C 80,110 86,132 88,152",
  "M 128,92 C 120,110 114,132 112,152",
  // Glute divide
  "M 100,250 L 100,300",
  // Calf muscle bulge hint
  "M 52,342 C 53,362 53,378 52,394",
  "M 148,342 C 147,362 147,378 148,394",
];

// ─── Front-view muscle regions ────────────────────────────────────────────────

const FRONT_REGIONS: { id: MuscleGroup; path: string }[] = [
  {
    id: "SHOULDERS",
    path: `M 7,102 C 5,114 6,128 10,138 C 14,146 22,149 30,146
           C 38,143 42,133 40,123 C 38,112 30,105 22,102
           C 16,100 8,98 7,102 Z
           M 193,102 C 195,114 194,128 190,138 C 186,146 178,149 170,146
           C 162,143 158,133 160,123 C 162,112 170,105 178,102
           C 184,100 192,98 193,102 Z`,
  },
  {
    id: "CHEST",
    path: `M 47,95 C 39,100 40,120 46,132 C 52,142 64,148 80,147
           C 96,146 100,136 99,125 C 98,113 90,103 76,98 C 65,93 55,90 47,95 Z
           M 153,95 C 161,100 160,120 154,132 C 148,142 136,148 120,147
           C 104,146 100,136 101,125 C 102,113 110,103 124,98 C 135,93 145,90 153,95 Z`,
  },
  {
    id: "BICEPS",
    path: `M 8,116 C 6,126 7,152 11,162 C 15,170 23,172 29,168
           C 35,163 37,149 34,137 C 32,126 25,117 19,114
           C 13,112 9,110 8,116 Z
           M 192,116 C 194,126 193,152 189,162 C 185,170 177,172 171,168
           C 165,163 163,149 166,137 C 168,126 175,117 181,114
           C 187,112 191,110 192,116 Z`,
  },
  {
    id: "FOREARMS",
    path: `M 13,187 C 11,200 11,222 14,234 C 16,240 21,244 27,242
           C 32,239 33,226 31,212 C 29,200 23,190 18,187
           C 15,185 13,184 13,187 Z
           M 187,187 C 189,200 189,222 186,234 C 184,240 179,244 173,242
           C 168,239 167,226 169,212 C 171,200 177,190 182,187
           C 185,185 187,184 187,187 Z`,
  },
  {
    id: "CORE",
    path: `M 60,128 C 56,158 57,186 62,204 C 74,209 88,211 100,211
           C 112,211 126,209 138,204 C 143,186 144,158 140,128
           C 130,123 116,121 100,121 C 84,121 70,123 60,128 Z`,
  },
  {
    id: "LEGS",
    path: `M 43,254 C 40,274 38,298 38,322 C 38,330 42,334 50,335
           C 58,336 65,330 66,320 C 67,304 66,278 63,258
           C 60,252 54,250 48,251 C 44,252 43,252 43,254 Z
           M 157,254 C 160,274 162,298 162,322 C 162,330 158,334 150,335
           C 142,336 135,330 134,320 C 133,304 134,278 137,258
           C 140,252 146,250 152,251 C 156,252 157,252 157,254 Z`,
  },
  {
    id: "CALVES",
    path: `M 42,338 C 40,358 41,380 44,396 C 47,404 52,407 57,405
           C 62,402 64,394 63,380 C 62,362 60,344 57,336
           C 54,330 50,329 46,330 C 43,332 42,334 42,338 Z
           M 158,338 C 160,358 159,380 156,396 C 153,404 148,407 143,405
           C 138,402 136,394 137,380 C 138,362 140,344 143,336
           C 146,330 150,329 154,330 C 157,332 158,334 158,338 Z`,
  },
];

// ─── Back-view muscle regions ─────────────────────────────────────────────────

const BACK_REGIONS: { id: MuscleGroup; path: string }[] = [
  {
    id: "SHOULDERS",
    path: `M 7,102 C 5,114 6,128 10,138 C 14,146 22,149 30,146
           C 38,143 42,133 40,123 C 38,112 30,105 22,102
           C 16,100 8,98 7,102 Z
           M 193,102 C 195,114 194,128 190,138 C 186,146 178,149 170,146
           C 162,143 158,133 160,123 C 162,112 170,105 178,102
           C 184,100 192,98 193,102 Z`,
  },
  {
    id: "BACK",
    path: `M 44,92 C 38,114 36,150 38,178 C 40,198 48,214 58,218
           C 72,222 86,224 100,224 C 114,224 128,222 142,218
           C 152,214 160,198 162,178 C 164,150 162,114 156,92
           C 144,87 124,84 100,84 C 76,84 56,87 44,92 Z`,
  },
  {
    id: "TRICEPS",
    path: `M 8,116 C 6,126 7,152 11,162 C 15,170 23,172 29,168
           C 35,163 37,149 34,137 C 32,126 25,117 19,114
           C 13,112 9,110 8,116 Z
           M 192,116 C 194,126 193,152 189,162 C 185,170 177,172 171,168
           C 165,163 163,149 166,137 C 168,126 175,117 181,114
           C 187,112 191,110 192,116 Z`,
  },
  {
    id: "FOREARMS",
    path: `M 13,187 C 11,200 11,222 14,234 C 16,240 21,244 27,242
           C 32,239 33,226 31,212 C 29,200 23,190 18,187
           C 15,185 13,184 13,187 Z
           M 187,187 C 189,200 189,222 186,234 C 184,240 179,244 173,242
           C 168,239 167,226 169,212 C 171,200 177,190 182,187
           C 185,185 187,184 187,187 Z`,
  },
  {
    id: "GLUTES",
    path: `M 43,248 C 39,260 38,276 41,290 C 44,300 52,306 62,305
           C 74,304 82,294 81,281 C 80,267 72,256 61,251
           C 52,247 46,246 43,248 Z
           M 157,248 C 161,260 162,276 159,290 C 156,300 148,306 138,305
           C 126,304 118,294 119,281 C 120,267 128,256 139,251
           C 148,247 154,246 157,248 Z`,
  },
  {
    id: "LEGS",
    path: `M 43,254 C 40,274 38,298 38,322 C 38,330 42,334 50,335
           C 58,336 65,330 66,320 C 67,304 66,278 63,258
           C 60,252 54,250 48,251 C 44,252 43,252 43,254 Z
           M 157,254 C 160,274 162,298 162,322 C 162,330 158,334 150,335
           C 142,336 135,330 134,320 C 133,304 134,278 137,258
           C 140,252 146,250 152,251 C 156,252 157,252 157,254 Z`,
  },
  {
    id: "CALVES",
    path: `M 40,338 C 37,360 38,386 43,400 C 46,408 53,412 59,409
           C 65,406 67,396 66,380 C 65,360 63,342 59,334
           C 55,328 50,327 46,329 C 42,332 40,334 40,338 Z
           M 160,338 C 163,360 162,386 157,400 C 154,408 147,412 141,409
           C 135,406 133,396 134,380 C 135,360 137,342 141,334
           C 145,328 150,327 154,329 C 158,332 160,334 160,338 Z`,
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
        viewBox="0 0 200 430"
        className="w-full max-w-[150px]"
        aria-label="Muscle heatmap"
        style={{ overflow: "visible" }}
      >
        {/* ── Head ─────────────────────────────────────────── */}
        <ellipse
          cx="100" cy="30" rx="22" ry="26"
          fill="var(--card)"
          stroke="var(--sys-separator)"
          strokeWidth="1.5"
        />
        {/* Eyes */}
        <ellipse cx="92"  cy="27" rx="2.5" ry="3" fill="var(--sys-fill2)" />
        <ellipse cx="108" cy="27" rx="2.5" ry="3" fill="var(--sys-fill2)" />
        {/* Mouth */}
        <path
          d="M 94,39 Q 100,43 106,39"
          stroke="var(--sys-separator)"
          strokeWidth="1.1"
          fill="none"
          strokeLinecap="round"
        />

        {/* ── Body silhouette ───────────────────────────────── */}
        <path
          d={BODY_SILHOUETTE}
          fill="var(--card)"
          stroke="var(--sys-separator)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* ── Muscle region heat overlays ───────────────────── */}
        {regions.map(({ id, path }) => {
          const entry     = volumeMap.get(id);
          const intensity = entry?.intensity ?? 0;
          const opacity   = intensityToOpacity(intensity);
          const isHov     = hovered === id;

          if (opacity <= 0 && !isHov) {
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
            opacity="0.5"
            style={{ pointerEvents: "none" }}
          />
        ))}

        {/* ── Neck connector (drawn last for clean join) ────── */}
        <path
          d="M 87,56 L 113,56 L 112,70 L 88,70 Z"
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
