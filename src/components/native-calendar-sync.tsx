"use client";
import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { syncTrainingCalendar } from "@/lib/native/calendar";
const MIN_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
export function NativeCalendarSync() { const lastSyncRef = useRef(0); useEffect(() => { if (!Capacitor.isNativePlatform()) return; const maybeSync = () => { const now = Date.now(); if (now - lastSyncRef.current < MIN_SYNC_INTERVAL_MS) return; lastSyncRef.current = now; void syncTrainingCalendar(); }; maybeSync(); const interval = window.setInterval(maybeSync, MIN_SYNC_INTERVAL_MS); let remove: (() => void) | undefined; void CapacitorApp.addListener("resume", maybeSync).then((handle) => { remove = () => void handle.remove(); }); return () => { window.clearInterval(interval); remove?.(); }; }, []); return null; }
