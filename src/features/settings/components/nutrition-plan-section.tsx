"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { useI18n } from "@/lib/i18n-provider";
import { todayLocalISO } from "@/lib/date-only";

type Phase = "CUT" | "REVERSE_DIET" | "MAINTENANCE" | "BULK";

type NutritionPlanDTO = {
  id: string;
  phase: Phase;
  startDate: string;
  endDate: string | null;
  startCalories: number;
  weeklyCalorieStep: number;
  minCalories: number | null;
  maxCalories: number | null;
  proteinPerKg: number;
  fatPerKg: number;
  notes: string | null;
  createdAt: string;
};

const PHASES: Phase[] = ["CUT", "REVERSE_DIET", "MAINTENANCE", "BULK"];

type FormState = {
  phase: Phase;
  startDate: string;
  startCalories: string;
  weeklyCalorieStep: string;
  minCalories: string;
  maxCalories: string;
  proteinPerKg: string;
  fatPerKg: string;
};

const DEFAULT_FORM: FormState = {
  phase: "REVERSE_DIET",
  startDate: todayLocalISO(),
  startCalories: "2200",
  weeklyCalorieStep: "50",
  minCalories: "",
  maxCalories: "",
  proteinPerKg: "1.8",
  fatPerKg: "0.8",
};

export function NutritionPlanSection() {
  const { t } = useI18n();
  const [active, setActive] = useState<NutritionPlanDTO | null>(null);
  const [history, setHistory] = useState<NutritionPlanDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/nutrition-plan", { credentials: "include" });
      if (res.ok) {
        const json = (await res.json()) as { data: { active: NutritionPlanDTO | null; history: NutritionPlanDTO[] } };
        setActive(json.data.active);
        setHistory(json.data.history);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await authenticatedFetch("/api/nutrition-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          phase: form.phase,
          startDate: form.startDate,
          startCalories: Number(form.startCalories),
          weeklyCalorieStep: Number(form.weeklyCalorieStep || 0),
          minCalories: form.minCalories ? Number(form.minCalories) : undefined,
          maxCalories: form.maxCalories ? Number(form.maxCalories) : undefined,
          proteinPerKg: Number(form.proteinPerKg),
          fatPerKg: Number(form.fatPerKg),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error ?? t("common.error"));
        return;
      }
      setForm({ ...DEFAULT_FORM, startDate: todayLocalISO() });
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {active && !loading && (
        <div className="ios-group p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--sys-label3)" }}>
            {t("health.nutritionPlan.activePlan")}
          </p>
          <p className="mt-1 text-[15px] font-semibold">
            {t(`health.nutritionPlan.phase.${phaseKey(active.phase)}`)}
          </p>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--sys-label2)" }}>
            {t("health.nutritionPlan.since")} {active.startDate} · {active.startCalories} kcal
            {active.weeklyCalorieStep !== 0 ? ` (${active.weeklyCalorieStep > 0 ? "+" : ""}${active.weeklyCalorieStep} kcal/${t("health.weightTrend.week")})` : ""}
          </p>
        </div>
      )}

      <div className="ios-group divide-y" style={{ borderColor: "var(--sys-separator)" }}>
        <label className="ios-row" htmlFor="np-phase">
          <span className="flex-1">{t("health.nutritionPlan.phaseLabel")}</span>
          <span className="relative">
            <select
              id="np-phase"
              value={form.phase}
              onChange={(e) => setForm({ ...form, phase: e.target.value as Phase })}
              className="appearance-none bg-transparent pr-5 text-right text-[0.9375rem] outline-none"
              style={{ color: "var(--sys-label2)" }}
            >
              {PHASES.map((p) => (
                <option key={p} value={p}>
                  {t(`health.nutritionPlan.phase.${phaseKey(p)}`)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-0 top-1 h-3.5 w-3.5" style={{ color: "var(--sys-label3)" }} />
          </span>
        </label>

        <label className="ios-row" htmlFor="np-start-date">
          <span className="flex-1">{t("health.nutritionPlan.startDateLabel")}</span>
          <input
            id="np-start-date"
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            className="bg-transparent text-right text-[0.9375rem] outline-none"
            style={{ color: "var(--sys-label2)" }}
          />
        </label>

        <NumberRow
          id="np-start-calories"
          label={t("health.nutritionPlan.startCalories")}
          unit="kcal"
          value={form.startCalories}
          onChange={(v) => setForm({ ...form, startCalories: v })}
        />
        <NumberRow
          id="np-weekly-step"
          label={t("health.nutritionPlan.weeklyStep")}
          unit="kcal"
          value={form.weeklyCalorieStep}
          onChange={(v) => setForm({ ...form, weeklyCalorieStep: v })}
        />
        <NumberRow
          id="np-protein"
          label={t("health.nutritionPlan.proteinPerKg")}
          unit="g/kg"
          step="0.1"
          value={form.proteinPerKg}
          onChange={(v) => setForm({ ...form, proteinPerKg: v })}
        />
        <NumberRow
          id="np-fat"
          label={t("health.nutritionPlan.fatPerKg")}
          unit="g/kg"
          step="0.1"
          value={form.fatPerKg}
          onChange={(v) => setForm({ ...form, fatPerKg: v })}
        />

        <button
          type="button"
          className="ios-row w-full text-left"
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <span className="flex-1">{t("health.nutritionPlan.advanced")}</span>
          <ChevronDown
            className="h-4 w-4 transition-transform"
            style={{ color: "var(--sys-label3)", transform: advancedOpen ? "rotate(180deg)" : undefined }}
          />
        </button>
        {advancedOpen && (
          <>
            <NumberRow
              id="np-min-calories"
              label={t("health.nutritionPlan.minCalories")}
              unit="kcal"
              value={form.minCalories}
              onChange={(v) => setForm({ ...form, minCalories: v })}
              optional
            />
            <NumberRow
              id="np-max-calories"
              label={t("health.nutritionPlan.maxCalories")}
              unit="kcal"
              value={form.maxCalories}
              onChange={(v) => setForm({ ...form, maxCalories: v })}
              optional
            />
          </>
        )}
      </div>

      {error && <p className="text-[13px]" style={{ color: "#FF453A" }}>{error}</p>}

      <Button className="w-full" size="lg" onClick={save} disabled={saving}>
        {saving ? t("common.saving") : t("health.nutritionPlan.startPlan")}
      </Button>

      {history.length > 0 && (
        <div className="ios-group">
          <button
            type="button"
            className="ios-row w-full text-left"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            <span className="flex-1">{t("health.nutritionPlan.history")}</span>
            <ChevronDown
              className="h-4 w-4 transition-transform"
              style={{ color: "var(--sys-label3)", transform: historyOpen ? "rotate(180deg)" : undefined }}
            />
          </button>
          {historyOpen &&
            history.map((row) => (
              <div key={row.id} className="ios-row">
                <div>
                  <p className="text-[13px] font-medium">{t(`health.nutritionPlan.phase.${phaseKey(row.phase)}`)}</p>
                  <p className="text-[12px]" style={{ color: "var(--sys-label3)" }}>
                    {row.startDate} – {row.endDate ?? "—"} · {row.startCalories} kcal
                  </p>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function phaseKey(phase: Phase): string {
  return { CUT: "cut", REVERSE_DIET: "reverseDiet", MAINTENANCE: "maintenance", BULK: "bulk" }[phase];
}

function NumberRow({
  id, label, unit, value, onChange, step, optional,
}: {
  id: string; label: string; unit: string; value: string; onChange: (v: string) => void; step?: string; optional?: boolean;
}) {
  return (
    <label className="ios-row" htmlFor={id}>
      <span className="flex-1">{label}{optional ? "" : " *"}</span>
      <input
        id={id}
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 bg-transparent text-right text-[0.9375rem] outline-none"
        style={{ color: "var(--sys-label2)" }}
      />
      <span className="text-sm" style={{ color: "var(--sys-label3)" }}>{unit}</span>
    </label>
  );
}
