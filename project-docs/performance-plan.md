# Performance-Implementierungsplan

Stand: 2026-06-10. Ergebnis einer statischen Code-Analyse — Befunde mit Datei-Referenzen, priorisiert nach spürbarem Effekt pro Aufwand.

> **Status: Umgesetzt (alle Phasen, 2026-06-10).** Zusammenfassung der Änderungen:
> - Recharts überall per `next/dynamic` lazy geladen; toter Code `dashboard-analytics-charts.tsx` entfernt; `loading.tsx`-Skeletons für alle Hauptrouten (gemeinsame `PageSkeleton`-Komponente).
> - Rest-Timer: Intervall tickt nur bei laufendem Timer; neuer `useRestTimerActions()`-Context — `workout-detail` re-rendert nicht mehr sekündlich.
> - Workout-Detail bekommt Initialdaten serverseitig (`workout-detail-data.ts`); `previous-logs` von 2×N auf 2 Queries (`DISTINCT ON`).
> - Health-Dashboard, Metric-/Recovery-/Nutrition-Detail und Exercises laden Erstdaten im RSC; Exercise-Filter nutzen Shallow-History statt `router.push` (vorher Server-Roundtrip pro Tastenanschlag).
> - Dashboard-Volume-Queries als SQL-Aggregation (1 Zeile pro Workout/Übung statt pro Satz); `getNextPlanSession` parallelisiert.
> - Active-Workout-Banner: Navigations-Refetch auf 10 s gedrosselt.
> - Bugfix nebenbei: `GET /api/health-data` lieferte bei `limit` die **ältesten** statt neuesten Snapshots (`orderBy asc` + `take`) — betraf Health-Dashboard, Metric-Detail und Nutrition.
> - Verifiziert: `tsc` sauber, Production-Build ok, Smoke-Test über Register → Dashboard → Health → Recovery → Exercises (Filter) → Workout starten → Übung + Satz loggen.

## Diagnose: Warum fühlt sich die App laggy an?

Die App ist serverseitig solide aufgebaut (RSC, `unstable_cache`, JWT-Sessions, gute Indizes). Die Lags kommen aus vier Quellen:

1. **Client-Fetch-Wasserfälle:** Mehrere Seiten rendern eine Client-Komponente, die erst nach Hydration per `useEffect` ihre Daten lädt (Health, Metric-Detail, Exercises, Workout-Detail). Ablauf pro Navigation: Server-HTML → JS laden → hydrieren → `fetch()` → rendern. Das sind 2–4 serielle Roundtrips, auf dem iPhone über WLAN deutlich spürbar.
2. **Fehlende `loading.tsx`:** Nur `dashboard` und `workouts` haben Routen-Skeletons. Alle anderen Routen blockieren die Navigation visuell, bis der Server antwortet → „App hängt"-Gefühl.
3. **Rest-Timer tickt global:** `RestTimerProvider` umschließt die gesamte App-Shell und re-rendert sich **jede Sekunde — auch wenn kein Timer läuft** (`rest-timer-context.tsx:152`). Während des Trainings ändert sich zusätzlich der Context-Value sekündlich → `workout-detail.tsx` (1242 Zeilen) re-rendert im Sekundentakt.
4. **JS-Bundle:** Recharts wird in 8 Komponenten statisch importiert, nur 2 davon per `next/dynamic`. Außerdem liegt mit `dashboard-analytics-charts.tsx` (516 Zeilen + Recharts) toter Code im Dashboard-Feature.

---

## Phase 0 — Baseline messen (vor allen Änderungen)

- `next build` ausführen und die First-Load-JS-Größen pro Route notieren.
- Lighthouse (Mobile, Throttling) für `/dashboard`, `/workouts/[id]`, `/health` festhalten.
- React DevTools Profiler: eine Workout-Session mit laufendem Rest-Timer aufzeichnen (belegt Befund 3).
- Optional `@next/bundle-analyzer` als devDependency für Recharts-Anteil.

**Akzeptanz:** Zahlen dokumentiert, damit Phase 1–5 nachweisbar sind.

## Phase 1 — Quick Wins: Bundle & gefühlte Geschwindigkeit (≈ ½ Tag)

1. **Toten Code löschen:** `src/features/dashboard/components/dashboard-analytics-charts.tsx` wird nirgends importiert (Dashboard nutzt inzwischen Inline-SVG-Sparklines). Entfernen.
2. **Recharts dynamisch laden:** Statische Imports in
   `health-metric-chart.tsx`, `metric-detail.tsx`, `recovery-detail.tsx`, `body-weight-chart.tsx`, `exercise-volume-chart.tsx`, `exercise-progress-chart.tsx`, `body-measurements-tracker.tsx`
   per `next/dynamic` (`ssr: false`, Skeleton als Fallback) kapseln — Muster existiert bereits in `exercise-detail-analytics.tsx` und `body-weight-tracker.tsx`.
3. **`loading.tsx` für alle Hauptrouten:** `exercises`, `health` (+ `[metric]`, `recovery`, `nutrition`), `plans` (+ `[planId]`), `records`, `settings`, `coach`, `body-weight`, `exercises/[id]`. Einfache Skeletons nach Vorbild `dashboard-page-skeleton.tsx`. Sofortiges visuelles Feedback bei jeder Navigation.

**Erwartung:** Kleineres Initial-Bundle auf allen Nicht-Chart-Routen; Navigation fühlt sich sofort reaktiv an.

## Phase 2 — Rest-Timer-Re-Renders fixen (≈ ½ Tag)

Datei: `src/features/workouts/rest-timer-context.tsx`

1. **Intervall nur bei aktivem Timer:** Das `setInterval` (Zeile 152) an `endsAt != null && pausedRemaining == null` koppeln. Im Idle-Zustand tickt nichts mehr.
2. **Context splitten:** `RestTimerActionsContext` (stabile Callbacks: `start/stop/pause/resume/adjustTime`) von `RestTimerStateContext` (`remaining`, `progress`, …) trennen. `workout-detail.tsx` konsumiert dann nur die Actions + `isRestActive`; die sekündliche Anzeige lebt allein in `RestTimerBar`.
3. Verifizieren mit React Profiler: Während eines laufenden Timers darf nur noch `RestTimerBar` sekündlich rendern, nicht der Exercise-/Set-Baum.

**Erwartung:** Größter Einzelgewinn für die Flüssigkeit **während des Trainings** (Kern-Use-Case).

## Phase 3 — Workout-Detail: Daten-Wasserfall beseitigen (≈ 1 Tag)

1. **Initialdaten serverseitig mitgeben:** `app/(app)/workouts/[id]/page.tsx` lädt bereits Settings — zusätzlich das Workout (Query aus `api/workouts/[id]/route.ts` in eine Service-Funktion extrahieren) und als `initialData` an `WorkoutDetail` übergeben. Der Client-Fetch in `loadWorkout` bleibt für Offline/Refresh bestehen, blockiert aber nicht mehr das erste Rendern.
2. **`previous-logs` N+1 fixen** (`api/workouts/[id]/previous-logs/route.ts`): aktuell 2 Queries **pro Übung**. Ersetzen durch eine Abfrage: alle `WorkoutExercise` der letzten abgeschlossenen Workouts des Users mit `exerciseId IN (…)` + Sets laden, in JS pro Übung das jüngste nehmen (oder Raw-SQL mit `DISTINCT ON (exerciseId)`). Ziel: konstant 1–2 Queries statt 2×N.
3. **Previous-Logs parallel statt nacheinander:** beide Fetches beim Mount gleichzeitig starten (falls aktuell sequenziell über Effekt-Kette).

**Erwartung:** Workout öffnen geht von „Spinner + Wasserfall" zu „sofort da".

## Phase 4 — Client-Fetch-Seiten auf Server-Daten umstellen (≈ 1–2 Tage)

1. **Health-Dashboard** (`health-dashboard.tsx`): lädt client-seitig `health-data` + `recovery`. Umbauen auf Server-Komponente mit `Promise.all` + Suspense (Muster: Dashboard-Page); Chart-Teile bleiben Client.
2. **Metric-Detail / Recovery / Nutrition:** gleiche Umstellung — Daten im RSC laden, Client-Komponente bekommt Props.
3. **Exercise-List** (`exercise-list.tsx`): Erstdaten serverseitig (Filter über `searchParams`), Client-Filterung bleibt für Interaktivität.
4. Wo die Umstellung zu invasiv ist: mindestens `unstable_cache` auf den API-Handlern + `loading.tsx` aus Phase 1 als Abfederung.

**Erwartung:** 1 Roundtrip statt 2–4 pro Seitenaufruf; Streaming-Skeletons statt Leerzustand.

## Phase 5 — Datenbank-Aggregation (≈ ½–1 Tag, spürbar bei wachsender Datenmenge)

Datei: `src/features/dashboard/queries.ts`

1. `getVolumeBucketsWeekly` / `getVolumeBucketsMonthly` / `getTopExercisesByVolume` laden **alle Set-Zeilen** des Zeitraums und aggregieren in JS. Ersetzen durch SQL-Aggregation (`$queryRaw` mit `date_trunc` + `SUM(reps*weight)` und Join über workoutExercise→workout). Reduziert Transfer von potenziell tausenden Zeilen auf ~10 Buckets.
2. `getNextPlanSession`: sequenzielle Queries parallelisieren (Strategy-1-Lookup + Fallback-Plan gleichzeitig anstoßen).
3. Cache-Strategie beibehalten (`unstable_cache`, Tag-Invalidierung) — die Punkte hier beschleunigen den Cold Path.

## Phase 6 — Verifikation

- Messungen aus Phase 0 wiederholen (Build-Output, Lighthouse, Profiler-Trace beim Training).
- Funktionstest Offline-Pfad (Workout-Queue, Rest-Timer-Persistenz über `sessionStorage`) — Phase 2/3 berühren diesen Code.
- Auf echtem iPhone via „Add to Home Screen" gegentesten (CLAUDE.md: primärer Mobile-Pfad).

---

## Explizit *nicht* nötig (geprüft, in Ordnung)

- **Sessions:** JWT-Strategie → kein DB-Hit pro Request.
- **Indizes:** `Workout(userId, completedAt)`, `Set(workoutExerciseId)` etc. vorhanden und passend.
- **Dashboard:** bereits gestreamt (Suspense), gecacht (45 s), Queries parallel via `Promise.all`.
- **Icons:** `optimizePackageImports` für `lucide-react`/`recharts` ist aktiv.
- **Backdrop-Blur/teure CSS-Effekte:** kaum vorhanden (3 Treffer), kein Renderkosten-Problem.
