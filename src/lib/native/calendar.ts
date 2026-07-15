"use client";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { APP_NAME } from "@/lib/constants";
import { todayLocalISO } from "@/lib/date-only";
interface EventKitPlugin { getAuthorizationStatus(): Promise<{ status: string }>; requestAccess(): Promise<{ granted: boolean }>; syncEvents(options: { calendarName: string; events: { date: string; title: string; notes?: string; startMinutes: number; durationMinutes: number }[] }): Promise<{ created: number; removed: number }>; removeAllEvents(options: { calendarName: string }): Promise<{ removed: number }>; }
const EventKitCalendar = registerPlugin<EventKitPlugin>("EventKitCalendar");
const AUTHORIZED_STORAGE_KEY = "fittrack-calendar-authorized";
const CARDIO_CALENDAR_NAME = "FitTrack Pro Cardio";
type Result = { created: number; removed: number; skipped: boolean };
type CalendarBlock = { enabled: boolean; calendarName: string; events: { date: string; title: string; notes: string | null; startMinutes: number; durationMinutes: number }[] };
const skipped: Result = { created: 0, removed: 0, skipped: true };
const authorized = () => { try { return localStorage.getItem(AUTHORIZED_STORAGE_KEY) === "1"; } catch { return false; } };
async function access() { try { if (authorized() && (await EventKitCalendar.getAuthorizationStatus()).status === "fullAccess") return true; const { granted } = await EventKitCalendar.requestAccess(); if (granted) localStorage.setItem(AUTHORIZED_STORAGE_KEY, "1"); return granted; } catch { return false; } }
let active: Promise<Result> | null = null;
export function syncTrainingCalendar() { if (!Capacitor.isNativePlatform()) return Promise.resolve(skipped); if (!active) active = sync().finally(() => { active = null; }); return active; }
async function sync(): Promise<Result> { try { const res = await fetch(`/api/calendar/schedule?today=${todayLocalISO()}&horizonDays=28`); const data = (await res.json()).data as { training: CalendarBlock; cardio: CalendarBlock } | undefined; if (!res.ok || !data) return skipped; if (!data.training.enabled && !data.cardio.enabled) { if (authorized()) await disableCalendarSync(); return skipped; } if (!(await access())) return skipped; let created = 0; let removed = 0; for (const block of [data.training, data.cardio]) { if (block.enabled) { const result = await EventKitCalendar.syncEvents({ calendarName: block.calendarName, events: block.events.map((event) => ({ ...event, notes: event.notes ?? undefined })) }); created += result.created; removed += result.removed; } else { const result = await EventKitCalendar.removeAllEvents({ calendarName: block.calendarName }); removed += result.removed; } } return { created, removed, skipped: false }; } catch (err) { console.error("[calendar] sync failed", err); return skipped; } }
export async function disableCalendarSync() { if (!Capacitor.isNativePlatform()) return; try { await Promise.all([EventKitCalendar.removeAllEvents({ calendarName: APP_NAME }), EventKitCalendar.removeAllEvents({ calendarName: CARDIO_CALENDAR_NAME })]); } catch (err) { console.error("[calendar] cleanup failed", err); } }
