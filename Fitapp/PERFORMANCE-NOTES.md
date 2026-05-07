# FitTrack Pro — Performance Refactor Plan
*Priorisierte Liste für die wahrgenommenen Lags (Tippen verzögert, Workout-Tracking, Tab-Wechsel, App-Start)*

## P0 — sofort, größter Hebel

### 1. Set-Eingabe: Optimistic state + Debounce statt onBlur PATCH
**Datei:** `src/features/workouts/components/set-row.tsx`
**Problem:** Jedes `onBlur` triggert sofort `fetch(... PATCH)`, kein Optimistic Update. Tippen fühlt sich verzögert an, weil React auf den Roundtrip wartet, bevor das nächste Set fokussierbar ist.
**Fix:** 
- Lokaler State sofort übernehmen, Save mit 400ms `useDeferredValue` + Debounce.
- "Complete" Button: optimistisches `set.isCompleted = true`, im Hintergrund speichern, Rollback bei Fehler.
- React 19 `useOptimistic` wenn verfügbar, sonst manuell.

### 2. Numpad-Lag: kein `text` Input mit decimal — natives numeric Keypad
**Datei:** `src/features/workouts/components/set-row.tsx`
**Problem:** `type="text" inputMode="decimal"` öffnet auf iOS *immer* das volle Keyboard, das langsam einblendet (~300ms). 
**Fix:** Eigener Tap-Stepper mit ±-Buttons + Long-Press (siehe Variant 2 "Console" im Mockup). Kein iOS-Keyboard, 0ms Lag.

### 3. Bottom Tab Bar: `prefetch` lädt jeden Tab beim Mount
**Datei:** `src/components/layout/bottom-tab-bar.tsx`
**Problem:** Alle 5 Tabs haben `prefetch` → Next.js holt 5 Routen + jeweilige Server Components beim ersten Render der Tab-Bar. Erste Sekunde der App ist überlastet.
**Fix:** `prefetch={false}` auf Plans/Library/Settings, nur Workouts + Coach prefetchen (häufigste Pfade).

### 4. Dashboard Charts: Recharts ist schwer
**Datei:** `src/features/dashboard/components/dashboard-analytics-charts.tsx`
**Problem:** Recharts importiert d3-scale, d3-shape, react-smooth — ~120kb gz. Auch hinter `dynamic()` blockiert es den ersten Paint, sobald Dashboard geöffnet wird.
**Fix:** SVG-Sparkline + native Bar-Chart selber zeichnen (siehe Mockup-Dashboard). 1-2kb. Recharts nur für die "Detail"-Charts behalten, die User aktiv öffnen.

## P1 — wichtig

### 5. RestTimer: setInterval statt requestAnimationFrame + state churn
**Datei:** `src/features/workouts/rest-timer-context.tsx` (vermutlich)
**Problem:** Wenn der Timer jede Sekunde `setRemaining(...)` calleed wird **und der Context** alle Children re-rendered, rerendert beim Workout die ganze Set-Liste 1x/s.
**Fix:** Timer-Display in eigenes Sub-Component isolieren. Context nur "isActive/duration", Display liest `useSyncExternalStore` aus einem RAF-Loop.

### 6. Set-Liste: virtualisieren bei langen Workouts
**Datei:** `src/features/workouts/components/workout-detail.tsx`
**Problem:** 8 Übungen × 5 Sätze = 40 SetRows mit Inputs + Memo-Vergleichen. Auf älteren iPhones merklich.
**Fix:** Pro Exercise collapse nach Completion. Aktive Übung volle Sets, fertige Übungen 1-Zeilen-Summary.

### 7. App-Start: zu viel im RootLayout
**Datei:** `src/app/(app)/layout.tsx`, `app-shell.tsx`
**Problem:** `RestTimerProvider` + `OfflineSyncProvider` + I18n Provider = 3 Contexts vor erstem Paint. + `prisma` queries serverseitig.
**Fix:** OfflineSync **lazy** beim ersten Mutation-Versuch initialisieren. RestTimerProvider nur unter `(app)/workouts/*` aktiv.

### 8. Tab-Wechsel: Server Component fetch jedes Mal
**Datei:** `src/app/(app)/dashboard/page.tsx`, alle SC-pages
**Problem:** Beim Tab-Wechsel rendert Next.js neu, Loading-Skeleton blitzt 200-400ms.
**Fix:** 
- `unstable_cache` mit 60s TTL auf `getDashboardClientPayload`.
- Auf Client `useTransition` + ein "stale data" Persist beim Pathname-Wechsel.

## P2 — Polish

### 9. Backdrop-Filter ist teuer auf iOS
**Datei:** `globals.css` (`.sidebar-glass`, tab bar)
**Problem:** `backdrop-filter: blur(24px) saturate(1.8)` mehrfach übereinander = GPU-bound scroll lag.
**Fix:** Nur **eine** Glass-Surface gleichzeitig. Tab Bar reicht — keine Sidebar-Glass auf Mobile.

### 10. PWA Service Worker: aggressive caching
**Datei:** `public/sw.js`
**Fix:** API-Responses mit stale-while-revalidate cachen, damit Tab-Wechsel sofort Daten zeigt.

### 11. `stagger-children` Animation verzögert wahrgenommen
**Datei:** `globals.css`
**Problem:** Bis zu 250ms Delay auf der 6. Karte → fühlt sich nach Lag an, ist aber gewollt.
**Fix:** Auf Mobile reduzieren auf max 80ms total, oder ganz weglassen.

### 12. Memo-Vergleich in SetRow
Funktioniert, aber `previousHint` wird oft re-erzeugt im Parent → Memo greift nicht. Parent sollte `useMemo` für den Hint-String pro Set.

---

## Quick wins (1h Arbeit, sofort spürbar)
1. `prefetch={false}` auf den selteneren Tabs → **−40% initial JS**
2. Input → Tap-Stepper im Active Workout → **kein Keyboard-Lag mehr**
3. Recharts nur on-demand → **Dashboard öffnet 300ms schneller**
4. Reduce `backdrop-filter`-Stacks → **Scroll wird butterweich**
