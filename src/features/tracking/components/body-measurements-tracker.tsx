"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Plus, Trash2, ChevronDown, ChevronUp, Ruler } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { saveBodyMeasurementsCache, loadBodyMeasurementsCache } from "@/lib/offline/screen-caches";

// ─── Types ────────────────────────────────────────────────────────────────────

type MeasurementFields = {
  neck?: number | null;
  chest?: number | null;
  leftArm?: number | null;
  rightArm?: number | null;
  waist?: number | null;
  hips?: number | null;
  leftThigh?: number | null;
  rightThigh?: number | null;
};

type Entry = MeasurementFields & {
  id: string;
  date: string;
  notes?: string | null;
};

type FieldKey = keyof MeasurementFields;

const FIELDS: { key: FieldKey; label: string; emoji: string }[] = [
  { key: "neck",       label: "Neck",        emoji: "🧣" },
  { key: "chest",      label: "Chest",       emoji: "💪" },
  { key: "leftArm",    label: "Left Arm",    emoji: "💪" },
  { key: "rightArm",   label: "Right Arm",   emoji: "💪" },
  { key: "waist",      label: "Waist",       emoji: "📏" },
  { key: "hips",       label: "Hips",        emoji: "📏" },
  { key: "leftThigh",  label: "Left Thigh",  emoji: "🦵" },
  { key: "rightThigh", label: "Right Thigh", emoji: "🦵" },
];

const MeasurementLineChart = dynamic(
  () => import("./measurement-line-chart").then((m) => m.MeasurementLineChart),
  {
    ssr: false,
    loading: () => <div className="h-[180px] w-full animate-pulse rounded-xl bg-[var(--sys-fill)]" />,
  }
);

const CHART_COLORS: Record<FieldKey, string> = {
  neck:       "#6366f1",
  chest:      "#0ea5e9",
  leftArm:    "#f59e0b",
  rightArm:   "#f97316",
  waist:      "#ef4444",
  hips:       "#ec4899",
  leftThigh:  "#22c55e",
  rightThigh: "#10b981",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function getDelta(entries: Entry[], key: FieldKey): string | null {
  const withVal = entries.filter((e) => e[key] != null);
  if (withVal.length < 2) return null;
  const first = withVal[0]![key]!;
  const last  = withVal[withVal.length - 1]![key]!;
  const diff  = last - first;
  const sign  = diff > 0 ? "+" : "";
  return `${sign}${diff.toFixed(1)} cm`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BodyMeasurementsTracker() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeChart, setActiveChart] = useState<FieldKey>("waist");
  const [showAllHistory, setShowAllHistory] = useState(false);

  // Form state
  const [formDate, setFormDate] = useState(today());
  const [formValues, setFormValues] = useState<Record<FieldKey, string>>({
    neck: "", chest: "", leftArm: "", rightArm: "",
    waist: "", hips: "", leftThigh: "", rightThigh: "",
  });
  const [formNotes, setFormNotes] = useState("");

  // Distinguishes "fetch failed" from "no measurements yet" so a network
  // error doesn't render the false empty state. `reload` re-runs the effect.
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/body-measurements");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const data = json.data ?? [];
      setEntries(data);
      setLoadError(false);
      void saveBodyMeasurementsCache(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Cache-first (project-docs/instant-load-roadmap.md Phase B): paint the
  // last-known entries immediately, then silently refresh in the background.
  // Kept inline (rather than calling `load()`) so no setState runs
  // synchronously in the effect body — every state update happens only after
  // an await, satisfying React 19's set-state-in-effect rule.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await loadBodyMeasurementsCache<Entry[]>();
      if (cancelled) return;
      if (cached) {
        setEntries(cached);
        setLoadError(false);
        setLoading(false);
      }

      try {
        const res = await fetch("/api/body-measurements");
        if (cancelled) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          const data = json.data ?? [];
          setEntries(data);
          setLoadError(false);
          void saveBodyMeasurementsCache(data);
        }
      } catch {
        if (!cancelled && !cached) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reload]);

  function openFormForDate(date: string) {
    const existing = entries.find((e) => e.date === date);
    setFormDate(date);
    const vals: Record<FieldKey, string> = {
      neck: "", chest: "", leftArm: "", rightArm: "",
      waist: "", hips: "", leftThigh: "", rightThigh: "",
    };
    if (existing) {
      for (const f of FIELDS) {
        const v = existing[f.key];
        vals[f.key] = v != null ? String(v) : "";
      }
      setFormNotes(existing.notes ?? "");
    } else {
      setFormNotes("");
    }
    setFormValues(vals);
    setShowForm(true);
  }

  async function handleSave() {
    const hasAny = FIELDS.some((f) => formValues[f.key].trim() !== "");
    if (!hasAny) {
      toast.error("Enter at least one measurement.");
      return;
    }
    setSaving(true);
    const body: Record<string, unknown> = { date: formDate, notes: formNotes || null };
    for (const f of FIELDS) {
      const v = parseFloat(formValues[f.key]);
      body[f.key] = isNaN(v) ? null : v;
    }
    const res = await fetch("/api/body-measurements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast.success("Measurements saved.");
      setShowForm(false);
      await load();
    } else {
      toast.error("Failed to save.");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/body-measurements?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Entry deleted.");
      setEntries((prev) => prev.filter((e) => e.id !== id));
    }
  }

  // Chart data — only include dates where the active metric has a value
  const chartData = entries
    .filter((e) => e[activeChart] != null)
    .map((e) => ({
      date: e.date.slice(5), // MM-DD
      [FIELDS.find((f) => f.key === activeChart)!.label]: e[activeChart],
    }));

  // Active fields that have any data
  const activeFields = FIELDS.filter((f) => entries.some((e) => e[f.key] != null));
  const latestEntry = entries.at(-1);
  const historyToShow = showAllHistory ? entries.slice().reverse() : entries.slice(-5).reverse();

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-32 rounded-2xl bg-muted/40" />
        <div className="h-48 rounded-2xl bg-muted/40" />
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Log button ──────────────────────────────────── */}
      {!showForm && (
        <button
          type="button"
          onClick={() => openFormForDate(today())}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--sys-separator)] py-4 text-sm font-medium text-[var(--sys-label2)] transition-colors hover:border-primary/40 hover:text-primary"
        >
          <Plus className="h-4 w-4" />
          Log today&apos;s measurements
        </button>
      )}

      {/* ── Entry form ──────────────────────────────────── */}
      {showForm && (
        <div className="ios-group px-4 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-[0.9rem]">Log Measurements</h3>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-[0.78rem] text-[var(--sys-label2)] hover:text-foreground"
            >
              Cancel
            </button>
          </div>

          {/* Date */}
          <div>
            <label className="block text-[0.68rem] font-semibold uppercase tracking-wider text-[var(--sys-label3)] mb-1.5">
              Date
            </label>
            <input
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              max={today()}
              className="w-full rounded-xl border border-[var(--sys-separator)] bg-[var(--sys-fill)] px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Measurement fields — 2 columns */}
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((f) => (
              <label key={f.key}>
                <span className="block text-[0.68rem] font-semibold uppercase tracking-wider text-[var(--sys-label3)] mb-1">
                  {f.label} <span className="normal-case font-normal">(cm)</span>
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={formValues[f.key]}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder="–"
                  className="w-full rounded-xl border border-[var(--sys-separator)] bg-[var(--sys-fill)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </label>
            ))}
          </div>

          {/* Notes */}
          <label>
            <span className="block text-[0.68rem] font-semibold uppercase tracking-wider text-[var(--sys-label3)] mb-1">
              Notes (optional)
            </span>
            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={2}
              placeholder="e.g. morning, after fasting…"
              className="w-full rounded-xl border border-[var(--sys-separator)] bg-[var(--sys-fill)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </label>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {/* ── Load error ──────────────────────────────────── */}
      {loadError && (
        <div className="ios-group px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground mb-1">Could not load measurements</p>
          <p className="text-[0.78rem] text-[var(--sys-label3)] mb-4">Check your connection and try again.</p>
          <button
            type="button"
            onClick={() => {
              setLoadError(false);
              setLoading(true);
              setReload((k) => k + 1);
            }}
            className="rounded-xl border border-[var(--sys-separator)] px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────── */}
      {!loadError && entries.length === 0 && (
        <div className="ios-group px-6 py-10 text-center">
          <Ruler className="mx-auto mb-3 h-8 w-8 text-[var(--sys-label3)]" />
          <p className="text-sm font-medium text-foreground mb-1">No measurements yet</p>
          <p className="text-[0.78rem] text-[var(--sys-label3)]">
            Track waist, chest, arms and more to see if training is working beyond the scale.
          </p>
        </div>
      )}

      {entries.length > 0 && (
        <>
          {/* ── Latest snapshot ─────────────────────────── */}
          {latestEntry && (
            <div className="ios-group px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-[0.9rem] font-semibold">Latest</h3>
                  <p className="text-[0.72rem] text-[var(--sys-label3)]">{formatDate(latestEntry.date)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => openFormForDate(latestEntry.date)}
                  className="text-[0.75rem] font-medium text-primary"
                >
                  Edit
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {FIELDS.filter((f) => latestEntry[f.key] != null).map((f) => {
                  const delta = getDelta(entries, f.key);
                  return (
                    <div key={f.key} className="rounded-xl bg-[var(--sys-fill)] px-3 py-2.5">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-[var(--sys-label3)]">
                        {f.label}
                      </p>
                      <p className="text-[1.05rem] font-bold text-foreground leading-tight">
                        {latestEntry[f.key]} <span className="text-[0.72rem] font-normal text-[var(--sys-label3)]">cm</span>
                      </p>
                      {delta && (
                        <p className={cn(
                          "text-[0.65rem] font-medium leading-tight",
                          delta.startsWith("+") ? "text-rose-500" : "text-emerald-500"
                        )}>
                          {delta} overall
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Progress chart ──────────────────────────── */}
          {activeFields.length > 0 && chartData.length > 1 && (
            <div className="ios-group px-4 py-4">
              <h3 className="text-[0.9rem] font-semibold mb-3">Progress</h3>

              {/* Field selector */}
              <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
                {activeFields.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setActiveChart(f.key)}
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1 text-[0.72rem] font-semibold transition-colors",
                      activeChart === f.key
                        ? "bg-primary text-primary-foreground"
                        : "bg-[var(--sys-fill)] text-[var(--sys-label2)]"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <MeasurementLineChart
                data={chartData}
                dataKey={FIELDS.find((f) => f.key === activeChart)!.label}
                color={CHART_COLORS[activeChart]}
              />
            </div>
          )}

          {/* ── History ─────────────────────────────────── */}
          <div className="ios-group overflow-hidden">
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <h3 className="text-[0.9rem] font-semibold">History</h3>
              <span className="text-[0.72rem] text-[var(--sys-label3)]">{entries.length} entries</span>
            </div>

            <div className="divide-y divide-[var(--sys-separator)]">
              {historyToShow.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.82rem] font-semibold">{formatDate(entry.date)}</p>
                    <p className="text-[0.72rem] text-[var(--sys-label3)] leading-relaxed mt-0.5 flex flex-wrap gap-x-3">
                      {FIELDS.filter((f) => entry[f.key] != null).map((f) => (
                        <span key={f.key}>{f.label}: <strong className="text-foreground">{entry[f.key]}</strong></span>
                      ))}
                    </p>
                    {entry.notes && (
                      <p className="text-[0.70rem] text-[var(--sys-label3)] italic mt-0.5">{entry.notes}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(entry.id)}
                    className="shrink-0 rounded-lg p-1.5 text-[var(--sys-label3)] hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {entries.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllHistory((v) => !v)}
                className="w-full flex items-center justify-center gap-1 py-3 text-[0.78rem] font-medium text-[var(--sys-label2)] hover:text-foreground border-t border-[var(--sys-separator)] transition-colors"
              >
                {showAllHistory ? (
                  <><ChevronUp className="h-3.5 w-3.5" /> Show less</>
                ) : (
                  <><ChevronDown className="h-3.5 w-3.5" /> Show all {entries.length} entries</>
                )}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
