"use client";

import { useState, useMemo } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n-provider";
import { calcPlates } from "@/features/tools/plate-math";

// ─── Plate definitions ───────────────────────────────────────────────────────

type PlateSpec = { weight: number; color: string; textColor: string };

const KG_PLATES: PlateSpec[] = [
  { weight: 25,   color: "#e63946", textColor: "#fff" },
  { weight: 20,   color: "#2563eb", textColor: "#fff" },
  { weight: 15,   color: "#ca8a04", textColor: "#fff" },
  { weight: 10,   color: "#16a34a", textColor: "#fff" },
  { weight: 5,    color: "#d1d5db", textColor: "#111" },
  { weight: 2.5,  color: "#e63946", textColor: "#fff" },
  { weight: 1.25, color: "#60a5fa", textColor: "#fff" },
];

const LB_PLATES: PlateSpec[] = [
  { weight: 45,  color: "#2563eb", textColor: "#fff" },
  { weight: 35,  color: "#ca8a04", textColor: "#fff" },
  { weight: 25,  color: "#16a34a", textColor: "#fff" },
  { weight: 10,  color: "#d1d5db", textColor: "#111" },
  { weight: 5,   color: "#e63946", textColor: "#fff" },
  { weight: 2.5, color: "#60a5fa", textColor: "#fff" },
];

const KG_BARS  = [20, 15] as const;
const LB_BARS  = [45, 35] as const;

// ─── Plate disc component ─────────────────────────────────────────────────────

function PlateDisc({
  spec,
  count,
  unit,
}: {
  spec: PlateSpec;
  count: number;
  unit: "kg" | "lb";
}) {
  const label = spec.weight >= 10 ? String(spec.weight) : spec.weight.toFixed(spec.weight === Math.floor(spec.weight) ? 0 : 2).replace(/\.?0+$/, "");
  // Size proportional to weight
  const maxW = unit === "kg" ? 25 : 45;
  const sizePct = 0.5 + (spec.weight / maxW) * 0.5;
  const h = Math.round(44 + sizePct * 52); // 44–96px height

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex items-center justify-center rounded-[3px] font-bold shadow-sm"
        style={{
          backgroundColor: spec.color,
          color: spec.textColor,
          width: 28,
          height: h,
          fontSize: spec.weight >= 10 ? "0.6rem" : "0.5rem",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          userSelect: "none",
        }}
      >
        {label}
      </div>
      {count > 1 && (
        <span className="text-[0.6rem] font-semibold text-[var(--sys-label2)]">
          ×{count}
        </span>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PlateCalculator({ defaultUnit = "KG" }: { defaultUnit?: "KG" | "LB" }) {
  const { t } = useI18n();
  const [unit, setUnit] = useState<"KG" | "LB">(defaultUnit);
  const [targetStr, setTargetStr] = useState("");
  const [barIdx, setBarIdx] = useState(0); // index into KG_BARS / LB_BARS
  const [customBar, setCustomBar] = useState("");
  const [useCustomBar, setUseCustomBar] = useState(false);

  const isKg    = unit === "KG";
  const specs   = isKg ? KG_PLATES : LB_PLATES;
  const barList = isKg ? KG_BARS   : LB_BARS;
  const barWeight = useCustomBar
    ? parseFloat(customBar) || 0
    : barList[barIdx] ?? barList[0];

  const target = parseFloat(targetStr);
  const result = useMemo(
    () => calcPlates(target, barWeight, specs),
    [target, barWeight, specs]
  );

  function increment(delta: number) {
    const step = isKg ? 2.5 : 5;
    const next = Math.max(0, (parseFloat(targetStr) || 0) + delta * step);
    setTargetStr(String(next));
  }

  function reset() {
    setTargetStr("");
  }

  return (
    <div className="space-y-5">

      {/* ── Unit selector ─────────────────────────── */}
      <div className="ios-group">
        <div className="ios-row justify-between">
          <span className="text-[0.9375rem] font-medium">{t("plateCalc.unit")}</span>
          <div className="flex rounded-lg overflow-hidden border border-[var(--sys-separator)]">
            {(["KG", "LB"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => { setUnit(u); setBarIdx(0); setUseCustomBar(false); }}
                className={cn(
                  "w-14 py-1.5 text-sm font-semibold transition-colors",
                  unit === u
                    ? "bg-primary text-primary-foreground"
                    : "bg-transparent text-[var(--sys-label2)] hover:bg-[var(--sys-fill)]"
                )}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {/* Bar weight */}
        <div className="ios-row justify-between">
          <span className="text-[0.9375rem] font-medium">{t("plateCalc.barWeight")}</span>
          <div className="flex items-center gap-2">
            {!useCustomBar && barList.map((bw, i) => (
              <button
                key={bw}
                type="button"
                onClick={() => setBarIdx(i)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                  barIdx === i && !useCustomBar
                    ? "bg-primary text-primary-foreground"
                    : "bg-[var(--sys-fill2)] text-[var(--sys-label)]"
                )}
              >
                {bw} {unit.toLowerCase()}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setUseCustomBar(!useCustomBar)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                useCustomBar
                  ? "bg-primary text-primary-foreground"
                  : "bg-[var(--sys-fill2)] text-[var(--sys-label)]"
              )}
            >
              {t("plateCalc.barCustomShort")}
            </button>
            {useCustomBar && (
              <input
                type="number"
                inputMode="decimal"
                value={customBar}
                onChange={(e) => setCustomBar(e.target.value)}
                placeholder="20"
                className="w-16 rounded-lg border border-[var(--sys-separator)] bg-[var(--sys-bg)] px-2 py-1.5 text-center text-sm outline-none focus:border-primary"
                style={{ fontSize: 16 }}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Target weight input ───────────────────── */}
      <div className="ios-group">
        <div className="ios-row gap-3">
          <span className="shrink-0 text-[0.9375rem] font-medium">{t("plateCalc.targetWeight")}</span>
          <div className="flex flex-1 items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => increment(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--sys-fill2)] text-[var(--sys-label)] active:bg-[var(--sys-fill)] transition-colors"
              aria-label="Decrease"
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="relative flex items-center">
              <input
                type="number"
                inputMode="decimal"
                value={targetStr}
                onChange={(e) => setTargetStr(e.target.value)}
                placeholder="–"
                className="w-24 rounded-xl border border-[var(--sys-separator)] bg-transparent py-2 pr-9 pl-3 text-right text-[1.125rem] font-semibold tabular-nums outline-none focus:border-primary"
                style={{ fontSize: 16 }}
              />
              <span className="pointer-events-none absolute right-3 text-sm text-[var(--sys-label3)]">
                {unit.toLowerCase()}
              </span>
            </div>
            <button
              type="button"
              onClick={() => increment(1)}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--sys-fill2)] text-[var(--sys-label)] active:bg-[var(--sys-fill)] transition-colors"
              aria-label="Increase"
            >
              <Plus className="h-4 w-4" />
            </button>
            {targetStr && (
              <button
                type="button"
                onClick={reset}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--sys-label3)] active:bg-[var(--sys-fill)] transition-colors"
                aria-label="Reset"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Result ───────────────────────────────── */}
      {result.type === "empty" ? (
        <div className="ios-group">
          <div className="ios-row justify-center py-6">
            <p className="text-sm text-[var(--sys-label3)]">{t("plateCalc.emptyHint")}</p>
          </div>
        </div>
      ) : result.type === "bar-only" ? (
        <div className="ios-group">
          <div className="ios-row justify-center py-6 flex-col gap-2">
            <p className="text-base font-semibold">{t("plateCalc.noPlatesNeeded")}</p>
            <p className="text-sm text-[var(--sys-label2)]">
              {t("plateCalc.totalWeight")}: {barWeight} {unit.toLowerCase()}
            </p>
          </div>
        </div>
      ) : result.type === "not-achievable" ? (
        <div className="ios-group border border-amber-500/30 bg-amber-500/5">
          <div className="ios-row flex-col items-start gap-1 py-3">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              {t("plateCalc.notAchievable", { nearest: `${result.nearest} ${unit.toLowerCase()}` })}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Total weight badge */}
          <div className="ios-group">
            <div className="ios-row justify-between">
              <span className="text-[0.9375rem] text-[var(--sys-label2)]">{t("plateCalc.totalWeight")}</span>
              <span className="font-display text-2xl font-bold tabular-nums">
                {result.total} <span className="text-base font-semibold text-[var(--sys-label2)]">{unit.toLowerCase()}</span>
              </span>
            </div>
            <div className="ios-row justify-between">
              <span className="text-[0.9375rem] text-[var(--sys-label2)]">{t("plateCalc.perSide")}</span>
              <span className="font-display text-xl font-bold tabular-nums">
                {Math.round((result.total - barWeight) / 2 * 100) / 100} <span className="text-sm font-semibold text-[var(--sys-label2)]">{unit.toLowerCase()}</span>
              </span>
            </div>
          </div>

          {/* Visual bar */}
          <div className="ios-group overflow-visible">
            <div className="px-4 py-5">
              <p className="ios-section-label mb-3 px-0">{t("plateCalc.perSide")}</p>
              <div className="flex items-end justify-center gap-1">
                {/* Bar sleeve */}
                <div
                  className="h-5 rounded-sm bg-[var(--sys-fill2)] shadow-inner"
                  style={{ width: 24, flexShrink: 0 }}
                />
                {/* Collar */}
                <div className="h-11 w-3 rounded-sm bg-zinc-400 shadow-sm" />
                {/* Plates */}
                {result.plates.map(({ spec, count }) =>
                  Array.from({ length: count }, (_, i) => (
                    <PlateDisc key={`${spec.weight}-${i}`} spec={spec} count={1} unit={unit.toLowerCase() as "kg" | "lb"} />
                  ))
                )}
                {/* Centre bar */}
                <div
                  className="h-4 rounded-full bg-zinc-400 shadow-sm"
                  style={{ width: 8, flexShrink: 0 }}
                />
                <div className="text-[0.6rem] font-semibold text-[var(--sys-label3)] pl-1">
                  {barWeight}{unit.toLowerCase()}
                </div>
              </div>
            </div>

            {/* Plate list */}
            {result.plates.length > 0 && (
              <>
                <div className="border-t border-[var(--sys-separator)]" />
                <div className="divide-y divide-[var(--sys-separator)]">
                  {result.plates.map(({ spec, count }) => (
                    <div key={spec.weight} className="ios-row justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-5 w-3 rounded-[2px] shadow-sm"
                          style={{ backgroundColor: spec.color }}
                        />
                        <span className="text-[0.9375rem] font-medium tabular-nums">
                          {spec.weight} {unit.toLowerCase()}
                        </span>
                      </div>
                      <span className="font-semibold text-[var(--sys-label2)]">
                        {t("plateCalc.plateLabel", { count: String(count * 2) })}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
