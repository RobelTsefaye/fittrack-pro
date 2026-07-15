"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RequireAuth } from "@/components/auth/require-auth";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { syncTrainingCalendar } from "@/lib/native/calendar";
import { todayLocalISO } from "@/lib/date-only";
import { useI18n } from "@/lib/i18n-provider";

type Override = { skip: boolean; movedToDate: string | null; timeMinutes: number | null; durationMinutes: number | null };
type Entry = { sourceDate: string; defaultTitle: string; defaultStartMinutes: number; defaultDurationMinutes: number; override: Override | null };
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const minutes = (value: string) => { const [hours, mins] = value.split(":").map(Number); return Number.isFinite(hours) && Number.isFinite(mins) ? hours * 60 + mins : null; };
const weekday = (date: string, locale: string) => new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00`));

export default function CalendarEditorPage() {
  const { t, locale } = useI18n();
  const params = useSearchParams();
  const kind = params.get("kind") === "cardio" ? "cardio" : "training";
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [skip, setSkip] = useState(false);
  const [movedToDate, setMovedToDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await authenticatedFetch(`/api/calendar/plan?kind=${kind}&today=${todayLocalISO()}&horizonDays=28`, { credentials: "include" });
    const json = res.ok ? await res.json() : null;
    setEntries(json?.data?.entries ?? []);
  }, [kind]);
  useEffect(() => { void load(); }, [load]);
  function open(entry: Entry) { setSelected(entry); setSkip(entry.override?.skip ?? false); setMovedToDate(entry.override?.movedToDate ?? ""); setTime(entry.override?.timeMinutes === null || entry.override?.timeMinutes === undefined ? "" : hhmm(entry.override.timeMinutes)); setDuration(entry.override?.durationMinutes?.toString() ?? ""); }
  function badge(entry: Entry) { if (entry.override?.skip) return t("calendarEditor.badgeSkipped"); if (entry.override?.movedToDate) return t("calendarEditor.badgeMoved"); if (entry.override?.timeMinutes !== null && entry.override?.timeMinutes !== undefined || entry.override?.durationMinutes !== null && entry.override?.durationMinutes !== undefined) return t("calendarEditor.badgeCustom"); return t("calendarEditor.badgeDefault"); }
  async function save() {
    if (!selected) return;
    const durationMinutes = duration === "" ? null : Number(duration);
    if (!Number.isInteger(durationMinutes) && durationMinutes !== null) return;
    setSaving(true);
    const res = await authenticatedFetch("/api/calendar/overrides", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ kind, date: selected.sourceDate, skip, movedToDate: movedToDate || null, timeMinutes: time ? minutes(time) : null, durationMinutes }) });
    setSaving(false);
    if (!res.ok) return;
    setSelected(null); await load(); void syncTrainingCalendar();
  }
  async function reset() {
    if (!selected) return;
    await authenticatedFetch(`/api/calendar/overrides?kind=${kind}&date=${selected.sourceDate}`, { method: "DELETE", credentials: "include" });
    setSelected(null); await load(); void syncTrainingCalendar();
  }
  return <RequireAuth><BackButton href="/settings" /><div className="space-y-5"><h1 className="page-title">{kind === "training" ? t("calendarEditor.titleTraining") : t("calendarEditor.titleCardio")}</h1><div className="ios-group">{entries.map((entry) => <button key={entry.sourceDate} type="button" onClick={() => open(entry)} className="ios-row w-full text-left"><div className="min-w-0 flex-1"><p className="text-[0.9375rem]">{entry.defaultTitle}</p><p className="text-xs text-[var(--sys-label2)]">{weekday(entry.sourceDate, locale)} · {hhmm(entry.override?.timeMinutes ?? entry.defaultStartMinutes)} · {entry.override?.durationMinutes ?? entry.defaultDurationMinutes} min</p></div><span className="rounded-full bg-[var(--sys-fill)] px-2 py-1 text-xs text-[var(--sys-label2)]">{badge(entry)}</span></button>)}</div></div><Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><DialogContent><DialogHeader><DialogTitle>{selected?.defaultTitle}</DialogTitle></DialogHeader><div className="space-y-4"><label className="flex items-center gap-3"><input type="checkbox" checked={skip} onChange={(event) => setSkip(event.target.checked)} className="h-5 w-5 accent-primary" />{t("calendarEditor.skip")}</label><label className="block space-y-1"><span>{t("calendarEditor.moveTo")}</span><input type="date" min={todayLocalISO()} value={movedToDate} onChange={(event) => setMovedToDate(event.target.value)} className="w-full rounded-md border bg-transparent px-3 py-2" /></label><label className="block space-y-1"><span>{t("calendarEditor.time")}</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="w-full rounded-md border bg-transparent px-3 py-2" /></label><label className="block space-y-1"><span>{t("calendarEditor.duration")}</span><input type="number" min={1} max={1439} value={duration} onChange={(event) => setDuration(event.target.value)} placeholder={`${selected?.defaultDurationMinutes ?? ""}`} className="w-full rounded-md border bg-transparent px-3 py-2" /></label></div><DialogFooter><Button variant="outline" onClick={reset}>{t("calendarEditor.reset")}</Button><Button onClick={save} disabled={saving}>{t("calendarEditor.save")}</Button></DialogFooter></DialogContent></Dialog></RequireAuth>;
}
