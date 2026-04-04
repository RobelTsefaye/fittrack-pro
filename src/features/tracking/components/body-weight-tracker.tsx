"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { todayLocalISO } from "@/lib/date-only";
import { useI18n } from "@/lib/i18n-provider";
import {
  applyOpToCache,
  bodyWeightQueueCount,
  enqueueBodyWeightOp,
  loadBodyWeightCache,
  saveBodyWeightCache,
} from "@/lib/offline/body-weight-offline-store";
import type { BodyWeightEntry } from "@/lib/offline/body-weight-offline-store";

interface BodyWeightTrackerProps {
  weightUnit: "KG" | "LB";
}

export function BodyWeightTracker({ weightUnit }: BodyWeightTrackerProps) {
  const { t } = useI18n();
  const unitLabel = weightUnit === "LB" ? "lb" : "kg";
  const [entries, setEntries] = useState<BodyWeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayLocalISO);
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  const [editEntry, setEditEntry] = useState<BodyWeightEntry | null>(null);
  const [editWeight, setEditWeight] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);

    // Check if there are pending offline ops — if so use cache only
    const pending = await bodyWeightQueueCount();
    if (pending > 0 || !navigator.onLine) {
      const cached = await loadBodyWeightCache();
      if (cached) {
        setEntries(cached);
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/body-weight");
      if (!res.ok) throw new Error("fetch_failed");
      const json = await res.json();
      const data: BodyWeightEntry[] = json.data ?? [];
      setEntries(data);
      await saveBodyWeightCache(data);
    } catch {
      // Fall back to cache if network fails
      const cached = await loadBodyWeightCache();
      if (cached) setEntries(cached);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Reload from server after sync completes
  useEffect(() => {
    const onSynced = () => void load();
    window.addEventListener("fittrack-bw-synced", onSynced);
    return () => window.removeEventListener("fittrack-bw-synced", onSynced);
  }, [load]);

  const chartData = useMemo(() => {
    return [...entries]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({ date: e.date, weight: e.weight }));
  }, [entries]);

  async function handleLog(e: React.FormEvent) {
    e.preventDefault();
    const w = parseFloat(weight);
    if (Number.isNaN(w) || w <= 0) return;
    setSaving(true);

    if (!isOnline) {
      const id = crypto.randomUUID();
      const op = {
        t: "post" as const,
        id,
        date,
        weight: w,
        notes: notes.trim() || null,
      };
      await enqueueBodyWeightOp(op);
      await applyOpToCache(op);
      const cached = await loadBodyWeightCache();
      if (cached) setEntries(cached);
      setWeight("");
      setNotes("");
      setSaving(false);
      return;
    }

    const res = await fetch("/api/body-weight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, weight: w, notes: notes.trim() || undefined }),
    });
    setSaving(false);
    if (!res.ok) return;
    setWeight("");
    setNotes("");
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm(t("bodyWeight.deleteConfirm"))) return;

    if (!isOnline) {
      const op = { t: "delete" as const, id };
      await enqueueBodyWeightOp(op);
      await applyOpToCache(op);
      const cached = await loadBodyWeightCache();
      if (cached) setEntries(cached);
      return;
    }

    await fetch(`/api/body-weight/${id}`, { method: "DELETE" });
    await load();
  }

  function openEdit(entry: BodyWeightEntry) {
    setEditEntry(entry);
    setEditWeight(String(entry.weight));
    setEditNotes(entry.notes ?? "");
  }

  async function handleEditSave() {
    if (!editEntry) return;
    const w = parseFloat(editWeight);
    if (Number.isNaN(w) || w <= 0) return;
    setEditSaving(true);

    if (!isOnline) {
      const op = {
        t: "patch" as const,
        id: editEntry.id,
        weight: w,
        notes: editNotes.trim() ? editNotes.trim() : null,
      };
      await enqueueBodyWeightOp(op);
      await applyOpToCache(op);
      const cached = await loadBodyWeightCache();
      if (cached) setEntries(cached);
      setEditEntry(null);
      setEditSaving(false);
      return;
    }

    const res = await fetch(`/api/body-weight/${editEntry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weight: w,
        notes: editNotes.trim() ? editNotes.trim() : null,
      }),
    });
    setEditSaving(false);
    if (!res.ok) return;
    setEditEntry(null);
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("bodyWeight.title")}</h1>
        <p className="text-muted-foreground">{t("bodyWeight.subtitle")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("bodyWeight.logTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLog} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bw-date">{t("bodyWeight.date")}</Label>
                  <Input
                    id="bw-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bw-weight">{t("bodyWeight.weight", { unit: unitLabel })}</Label>
                  <Input
                    id="bw-weight"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder={t("bodyWeight.weightPlaceholder")}
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bw-notes">{t("bodyWeight.notes")}</Label>
                <Textarea
                  id="bw-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={saving}
                  placeholder={t("bodyWeight.notesPlaceholder")}
                />
              </div>
              <Button type="submit" disabled={saving}>
                <Plus className="mr-2 h-4 w-4" />
                {saving ? t("common.saving") : t("bodyWeight.saveEntry")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="min-h-[280px]">
          <CardHeader>
            <CardTitle className="text-base">{t("bodyWeight.trendTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="h-[220px]">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t("bodyWeight.chartLoading")}
              </div>
            ) : chartData.length < 2 ? (
              <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground px-4">
                {t("bodyWeight.trendHint")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis
                    width={40}
                    tick={{ fontSize: 11 }}
                    domain={["auto", "auto"]}
                    className="text-muted-foreground"
                    label={{
                      value: unitLabel,
                      angle: -90,
                      position: "insideLeft",
                      style: { fontSize: 11, fill: "var(--muted-foreground)" },
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                    }}
                    formatter={(v) => [
                      typeof v === "number" ? `${v} ${unitLabel}` : "—",
                      t("bodyWeight.chartSeriesWeight"),
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="var(--color-chart-1)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("bodyWeight.historyTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("bodyWeight.noEntries")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {entry.weight} {unitLabel}
                    </p>
                    <p className="text-xs text-muted-foreground">{entry.date}</p>
                    {entry.notes ? (
                      <p className="text-sm text-muted-foreground mt-1">{entry.notes}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEdit(entry)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(entry.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editEntry} onOpenChange={(o) => !o && setEditEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bodyWeight.editTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {t("bodyWeight.date")}: {editEntry?.date}
            </p>
            <div className="space-y-2">
              <Label>{t("bodyWeight.weight", { unit: unitLabel })}</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={editWeight}
                onChange={(e) => setEditWeight(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("bodyWeight.notesEditLabel")}</Label>
              <Textarea
                rows={2}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
