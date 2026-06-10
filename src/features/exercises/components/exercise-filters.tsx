"use client";

import { useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { MUSCLE_GROUPS, EQUIPMENT_TYPES } from "@/lib/constants";
import { Search } from "lucide-react";
import { useCallback } from "react";
import { useI18n } from "@/lib/i18n-provider";

function formatLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ExerciseFilters() {
  const { t } = useI18n();
  const searchParams = useSearchParams();

  const muscleGroup = searchParams.get("muscleGroup") ?? "ALL";
  const equipment = searchParams.get("equipment") ?? "ALL";
  const search = searchParams.get("search") ?? "";

  // Shallow URL update — the list filters via client fetch, so a server
  // round-trip per keystroke/filter click is wasted work. replaceState for
  // typing (no history spam), pushState for discrete filter choices.
  const updateParam = useCallback(
    (key: string, value: string, opts: { replace?: boolean } = {}) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "ALL") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      const qs = params.toString();
      const url = qs ? `/exercises?${qs}` : "/exercises";
      if (opts.replace) window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
    },
    [searchParams]
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("exercises.searchPlaceholder")}
          defaultValue={search}
          className="pl-9"
          onChange={(e) => {
            const val = (e.target as HTMLInputElement).value;
            updateParam("search", val, { replace: true });
          }}
        />
      </div>

      <select
        value={muscleGroup}
        onChange={(e) => updateParam("muscleGroup", e.target.value)}
        className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="ALL">{t("exercises.filterAllMuscle")}</option>
        {MUSCLE_GROUPS.map((mg) => (
          <option key={mg} value={mg}>
            {formatLabel(mg)}
          </option>
        ))}
      </select>

      <select
        value={equipment}
        onChange={(e) => updateParam("equipment", e.target.value)}
        className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="ALL">{t("exercises.filterAllEquipment")}</option>
        {EQUIPMENT_TYPES.map((eq) => (
          <option key={eq} value={eq}>
            {formatLabel(eq)}
          </option>
        ))}
      </select>
    </div>
  );
}
