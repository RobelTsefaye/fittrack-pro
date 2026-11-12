# 04 Performance (FitTrack, Stand 2026-11-12, Branch refactor/audit-2026-11)

Ziel: alles flüssig, ohne Delay (Selbst-Hosting auf dem Mac, iPhone-App über Funnel). Nur gelesen, nichts geändert. Präfix FT-PERF-.
Gemessen wurde nur, was ohne DB und Netz geht (Bundle-Größen aus `npm run build` mit Platzhalter-Env). Alle Latenzaussagen (Neon-Round-Trip, Funnel, Poll-Last) sind **Vermutung** und als solche markiert; sie sollten mit den Befehlen in "Mess-Vorschläge" bestätigt werden.
Bezüge: KB-09 (Workout-Logging hängt/langsam), KB-10 (Cardio-Uhr), KB-11 (Offline-Sync), KB-G (Selbst-Hosting). Schon bekannt aus `01-architektur.md` und hier nur vertieft: FT-ARCH-08 (1-s-Poll), -09 (memo-Komparator/Re-Renders), -20 (Selfhost-Betrieb), -21 (keine fetch-Timeouts), -23 (middleware/proxy), -27 (Dexie-Schema).

## Zusammenfassung
1. Größter echter Hebel auf dem Server: **"Workout beenden" macht eine N+1-Schleife** (je Arbeitssatz 2-3 sequentielle Queries, FT-PERF-01) und **jeder Set-PATCH eine Kette von bis zu 7 sequentiellen Queries** (FT-PERF-05). Bei Neon-Round-Trips von 30-100 ms (Vermutung) sind das Sekunden.
2. Jeder 1-s-Poll (FT-ARCH-08) kostet pro Tick 4-7 DB-Queries inklusive einer Schreib-Query (`lastUsedAt`), FT-PERF-02 und -06; dazu hält jeder offene Web-Tab per SSE eine Query alle 300 ms offen (FT-PERF-04).
3. Pool: pg-Default `idleTimeoutMillis` 10 s, `max` 10. Nach 10 s Leerlauf wird die Neon-Verbindung geschlossen, die nächste Anfrage zahlt TCP+TLS+Auth zu Neon neu (FT-PERF-03, Vermutung zur Höhe).
4. Bundle (gemessen): jede Route lädt 948-1341 KB JS roh (261-388 KB gzip); Login allein 279 KB gzip. three.js (744 KB roh) und recharts sind korrekt lazy und nicht im First Load.
5. Kein kritischer Fund; 5 hoch, 9 mittel, 6 niedrig. Alle Fixes unten sind einzeln ohne Verhaltensänderung möglich; Risiko und Aktualität sind je Fund angegeben.

## Messung (ohne DB/Netz)
Build: `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci AUTH_SECRET=ci-placeholder-not-a-secret NEXT_TELEMETRY_DISABLED=1 npm run build` (Exit 0, Turbopack, Compile 11,6 s, TypeScript 10,7 s, 74 Seiten). Hinweis: der Build hat `.next/` im Repo neu geschrieben (Build-Artefakt, ignoriert). Next 16 gibt keine Größen je Route im Build-Log aus; Quelle ist `.next/diagnostics/route-bundle-stats.json` (First-Load-JS roh) plus eigene gzip-Messung der Chunks (gzip -6, Näherung für Server-Kompression).

| Route | First-Load JS roh | gzip |
|---|---|---|
| `/_not-found` (= Grundlast) | 948 KB | 261 KB |
| `/` | 986 KB | 274 KB |
| `/login`, `/register` | 999-1000 KB | 279 KB |
| `/workouts`, `/workouts/cardio` | 1052 KB | 295-296 KB |
| `/settings/*` | 1040-1062 KB | 292-299 KB |
| `/exercises/[id]`, `/exercises/usage` | 1054-1058 KB | 296 KB |
| `/plans`, `/exercises` | 1142-1150 KB | 325-328 KB |
| `/plans/[planId]` | 1301 KB | 376 KB |
| `/workouts/[id]` | 1338 KB | 387 KB |
| `/workouts/new` | 1341 KB | 388 KB |

Gesamt: `.next/static` 4,0 MB (alle JS-Chunks 3,6 MB roh, 1,05 MB gzip, CSS 126 KB roh), `.next/server` 41 MB. Lazy-Chunks, nicht im First Load: three.js 744 KB roh / 186 KB gzip (nur beim ersten PR), zwei recharts-Chunks je 386 KB roh / 111 KB gzip (nur Übungsdetail und Nutzung). Gleich große Chunks mit verschiedenem Hash (z. B. dnd-kit 147 KB zweimal, 72 KB zweimal) deuten auf doppelt gebündelte Module je Routengruppe hin (Vermutung, nicht je Modul aufgeschlüsselt, da minifiziert).
`public/` ist 64 KB (keine großen Bilder). Schriften: `next/font/google` (self-hosted beim Build), 3 Familien (Geist, Geist Mono, Barlow Condensed 600/700), kein Befund.

---

## Hoch

**FT-PERF-01** (KB-09) Workout beenden: N+1 über alle Arbeitssätze
- Fundstelle: `src/app/api/workouts/[id]/complete/route.ts:85-108` (Schleife `for (const s of setsForPr) await recordPersonalRecordIfBest`), `src/lib/personal-record.ts:17-27,42-50` (je Satz `findUnique` + `findFirst` + ggf. `create`), `complete/route.ts:8-20,55,110` (`sumWorkoutVolume` zweimal, Summe im Node statt SQL)
- Schweregrad: hoch
- Auswirkung: Ein Training mit 20-30 Arbeitssätzen erzeugt 40-90 sequentielle Queries, bevor die Antwort rausgeht, zuzüglich 8-9 weitere (Workout, Vorgänger, updateMany, Summen). Bei 30-100 ms je Neon-Round-Trip (Vermutung) sind das 2-9 s für "Beenden" (Watch-Aktion und Phone-Spinner `completing`). Der Aufruf kommt auch von der Watch/Offline-Queue (Replay).
- Fix-Vorschlag: Vorhandene PRs der Sätze (`setId in (...)`) und je Übung den Bestwert in zwei Queries laden, Schleife im Speicher mit laufendem Bestwert je Übung ausführen (gleiche Reihenfolge-Semantik wie jetzt), neue PRs mit einem `createMany`; Volumen in einer SQL-Aggregation (`SUM(weight*reps)`) oder aus den bereits geladenen Sätzen berechnen. Charakterisierungstest `personal-record` ist vorhanden; vorher einen Test für die Reihenfolge (Rampe mit mehreren PRs in einer Einheit) ergänzen.
- Aufwand: M
- Verhaltensrisiko: niedrig bis mittel (PR-Semantik bei Gleichstand und Reihenfolge; `setsForPr` hat heute kein `orderBy`, die Ist-Reihenfolge ist nicht garantiert). Aktualität bleibt gleich.

**FT-PERF-02** (KB-09, KB-G; vertieft FT-ARCH-08) Kosten eines Polls tatsächlich 4-7 Queries plus Schreibzugriff plus IndexedDB-Write
- Fundstelle: `src/features/workouts/components/workout-detail.tsx:1688-1694` (1 s), `src/app/api/workouts/[id]/route.ts:14-37`, `src/lib/api-auth.ts:20-30` (Bearer: `auth()`, `headers()`, Token-SELECT, Token-UPDATE), `src/lib/offline/workout-offline-store.ts:21-34` (`JSON.stringify` des ganzen Workouts + Dexie-`put` je Poll)
- Schweregrad: hoch
- Auswirkung: Je Tick: Token-`findUnique`, Token-`update` (siehe -06), Workout mit verschachtelten Includes (je nach `relationLoadStrategy` 1 Join-Query oder 4-5 Einzel-Queries; Prisma-7-Default nicht geprüft, Vermutung), `userSettings`. Das sind 4-7 Queries und 1 Write je Sekunde und Client, also 14-25 Tausend Queries je Stunde Training. Antwortgröße wächst mit der Satzzahl (alle Sätze, alle Spalten, bei 30 Sätzen grob 8-15 KB, Vermutung). Zusätzlich je Tick: Re-Render (neues Objekt), Watch-Push (FT-ARCH-08), Dexie-Write mit Vollserialisierung.
- Fix-Vorschlag (zusätzlich zu FT-ARCH-08): `GET` mit schwachem ETag aus `max(updatedAt)`-Ersatz (Sets haben kein `updatedAt`; praktikabel: Hash über die JSON-Antwort und `304` ohne Body), Token-Update entfällt (siehe -06), `userSettings.restTimerDefault` im Client cachen und nur alle N Polls mitladen oder die Settings-Query mit in `Promise.all` lassen (ist bereits parallel). Client: `saveWorkoutSnapshot` und Watch-Push nur bei geändertem Hash.
- Aufwand: M
- Verhaltensrisiko: mittel (Watch-Synchronität, Wiederholungsversuch bei 304-Handling im nativen HTTP-Bridge-Fetch). Aktualität bleibt bei Poll 1 s gleich, solange der Hash den Inhalt exakt abbildet.

**FT-PERF-03** (KB-G) Neon-Verbindungsaufbau: Pool-Defaults und Direktverbindung
- Fundstelle: `src/lib/prisma.ts:12` (bevorzugt `DIRECT_DATABASE_URL`), `:19-20` (`new PrismaPg(connectionString)` ohne Pool-Optionen), `node_modules/pg-pool/index.js:89,98-99` (Defaults `max` 10, `idleTimeoutMillis` 10000, kein `connectionTimeoutMillis`)
- Schweregrad: hoch (Vermutung zur Wirkung; Code-Befund belegt)
- Auswirkung: Nach 10 s ohne Anfrage schließt der Pool seine Verbindungen. Die nächste Anfrage (typisch nach Satzpause, Ruhezeit 180 s) baut TCP+TLS+Postgres-Auth zu Neon neu auf, grob 100-400 ms je nach Region (Vermutung) und zusätzlich Neon-Compute-Weckzeit nach dessen Suspend (Neon-Default 5 min, Plan-abhängig, nicht prüfbar). Ohne `connectionTimeoutMillis` wartet eine Anfrage bei erschöpftem Pool unbegrenzt (FT-ARCH-21). `max` 10 reicht nicht für parallele Bündel: Dashboard-Payload feuert 25-30 Queries gleichzeitig (FT-PERF-16), Poll und SSE (FT-PERF-04) konkurrieren um dieselben 10 Verbindungen. Region der Neon-DB gegenüber dem Mac ist im Repo nicht erkennbar (Vermutung: eine Europa-Region wäre günstig, ein US-Endpunkt kostet je Query 100-150 ms).
- Fix-Vorschlag: `new PrismaPg({ connectionString, max: 10, idleTimeoutMillis: 300_000, connectionTimeoutMillis: 10_000, keepAlive: true })`; Neon-Verbindung zeitlich am Neon-Suspend ausrichten oder Neon-Autosuspend am Mac-Betrieb abschalten/verlängern (Konsole, nicht im Repo). Mit pooler-URL (`-pooler`) wäre Pool-Wechsel serverseitig billig, hier aber unnötig, weil der Prozess langlebig ist. Region prüfen und DB-RTT messen (siehe Mess-Vorschläge).
- Aufwand: S
- Verhaltensrisiko: niedrig (nur Verbindungsverwaltung; bei zu langem Idle ältere Verbindungen, die Neon schon geschlossen hat: pg erkennt das über `error`-Event, `onPoolError` im Adapter beachten). Aktualität gleich.

**FT-PERF-04** (KB-10, KB-G) SSE-Stream fragt die DB alle 300 ms, in jedem offenen Web-Tab
- Fundstelle: `src/app/api/cardio/live/stream/route.ts:23` (`CHECK_INTERVAL_MS = 300`), `:75-76` (`findUnique` je Tick), `:61` (Stream 50 s, danach Reconnect mit neuem `requireUserId()`), `src/components/layout/app-shell.tsx:33` (`CardioLiveProvider` in jeder App-Seite), `src/features/cardio/cardio-live-context.tsx:70-72,23` (EventSource auf Web, Fallback-Poll 5 s auf Native)
- Schweregrad: hoch
- Auswirkung: Jeder geöffnete Web-/Safari-Tab (auch ohne Cardio-Einheit) hält dauerhaft einen Stream, der 3,3 Queries/s absetzt, also rund 12 000 Queries je Stunde und Tab, plus alle 50 s eine neue Anfrage mit Auth. Das hält Neon wach (Kosten, aber auch das Gegenteil von Cold Start), belegt Pool-Verbindungen und Event-Loop. Native (iPhone-App) nutzt den Fallback-Poll 5 s (`/api/cardio/live`), das ist deutlich billiger. Auch "Cardio" bei laufender Uhr (KB-10) konkurriert mit Workout-Poll um den Pool.
- Fix-Vorschlag: Stufe 1 (ohne Verhaltensänderung): Stream erst aufbauen, wenn `document.visibilityState === "visible"` und `CardioLiveProvider` nur auf Cardio-relevanten Seiten oder nach Hinweis aus `/api/workouts?status=active` laufend. Stufe 2: Im selben Node-Prozess (Selbst-Hosting, eine Instanz) die Änderung von `POST /api/cardio/live` per `EventEmitter`/globalThis-Map an die offenen Streams melden und die DB-Schleife durch Event plus 10-s-Sicherheitsabfrage ersetzen; gleiche Latenz (unter 300 ms), nahezu keine Queries im Leerlauf.
- Aufwand: M
- Verhaltensrisiko: mittel (Realtime-Pfad; bei Mehrinstanz-Betrieb, z. B. Vercel, greift Stufe 2 nicht, dort Fallback auf Abfrage beibehalten). Aktualität gleich, wenn Event plus Sicherheitsabfrage.

**FT-PERF-05** (KB-09, KB-11) Set-PATCH: bis zu 7 sequentielle Queries, nichts in einer Transaktion
- Fundstelle: `src/app/api/workouts/[id]/sets/[setId]/route.ts:20-30` (`findFirst` mit verschachteltem Filter), `:56-59` (`update`), `:64-69` (`workout.update` nur bei neu abgeschlossenem Satz), `:73` (`deleteMany` nach `setId`), `src/lib/personal-record.ts:17-50` (`findUnique`, `findFirst`, `create`)
- Schweregrad: hoch (Wirkung Vermutung; Code belegt)
- Auswirkung: Jeder Satz-Abschluss wartet auf bis zu 7 Round-Trips plus Auth (bei Bearer zusätzlich 2). Die Phone-UI ist optimistisch, die Watch und der Offline-Replay (`flush-workout-queue.ts`) warten aber seriell auf jede Antwort; die Queue-Abarbeitung nach Verbindungsausfall dauert dadurch je Operation Sekunden (KB-11: Sync "hängt").
- Fix-Vorschlag: `workout.update` (restTimerAdjust) parallel zum `set.update` per `Promise.all` oder beide in einem `$transaction`; `removePersonalRecordForSet` und `findUnique` zu einem `deleteMany`+Prüfung zusammenfassen (die `setId`-Unique-Spalte ist indiziert, aber jede Query kostet einen Round-Trip); `findFirst` mit `select` auf die benötigten Felder (hier `include` mit `workoutExercise.exerciseId`).
- Aufwand: S bis M
- Verhaltensrisiko: niedrig (Reihenfolge `removePR` vor `recordIfBest` bleibt erhalten; Transaktion ändert nur Atomarität zugunsten der Konsistenz). Aktualität gleich. Hinweis: dieser Pfad ruft kein `revalidateTag` (siehe -07).

---

## Mittel

**FT-PERF-06** (KB-09, KB-G) Bearer-Auth schreibt bei jedem Request in die DB
- Fundstelle: `src/lib/api-auth.ts:12-15` (`prisma.apiToken.update({ lastUsedAt })` je Aufruf, fire-and-forget)
- Schweregrad: mittel
- Auswirkung: Jede Anfrage der iPhone-App, der Watch und von Claude/MCP erzeugt zusätzlich einen UPDATE (WAL-Write, Pool-Verbindung, Zeilen-Lock). Bei 1-s-Poll und SSE-Reconnects (-02, -04) ist das Dauer-Schreiblast auf einer einzigen Zeile; konkurrierende Updates derselben Zeile serialisieren sich. Fehler werden still verschluckt (`.catch(() => {})`).
- Fix-Vorschlag: `lastUsedAt` mitlesen (`select`) und nur schreiben, wenn älter als z. B. 5 Minuten, oder im Prozess pro Token höchstens alle 60 s.
- Aufwand: S
- Verhaltensrisiko: niedrig (Anzeige "zuletzt benutzt" in Settings wird auf Minuten ungenau; Auth-Entscheidung unverändert).

**FT-PERF-07** Cache-Invalidierung mit `revalidateTag(tag, "max")` liefert laut Doku einmal veraltete Daten
- Fundstelle: `src/app/api/workouts/[id]/complete/route.ts:123-124` (ebenso `workouts/route.ts`, `workouts/[id]/route.ts`; 16 Aufrufstellen), `src/features/workouts/workouts-list-data.ts:93-106` und `src/features/dashboard/queries.ts:632-638` (`unstable_cache`, `revalidate: 45`), `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidateTag.md` (Zeilen 20-23, 136)
- Schweregrad: mittel (**Vermutung**, nur durch Doku belegt, nicht gegen die laufende App getestet)
- Auswirkung: Mit Profil `"max"` markiert Next 16 den Eintrag als stale und liefert beim nächsten Zugriff **zuerst den alten Stand** und rechnet im Hintergrund neu (Stale-While-Revalidate). Direkt nach "Workout beenden" könnte `/api/workouts?limit=50` (Standardaufruf der Liste, `workout-history-list.tsx:219`) die Liste ohne das neue Workout liefern; ein zweiter Aufruf zeigt es. Fühlt sich wie "Delay/veraltet" an, ist aber kein Performancegewinn, den man behalten müsste. Gegenstück: Set-PATCH (`sets/[setId]/route.ts`) und Übungs-/Satz-Routen rufen gar kein `revalidateTag`; Dashboard/Liste sind bis zu 45 s alt.
- Fix-Vorschlag: In Route-Handlern `revalidateTag(tag, { expire: 0 })` (laut Doku für sofortige Ablaufzeit vorgesehen) statt `"max"`; vorher an der laufenden App prüfen, ob das Stale-Verhalten tatsächlich auftritt.
- Aufwand: S
- Verhaltensrisiko: niedrig; ändert Aktualität nur zum Besseren (Daten sofort aktuell, dafür ein Cache-Miss-Query nach jeder Mutation).

**FT-PERF-08** Workout-Liste lädt alle Satz-Spalten und verwirft sie
- Fundstelle: `src/features/workouts/workouts-list-data.ts:5-13` (`sets: true`), `:28-31` (DTO nutzt nur `sets: { id }[]`), genutzt von `/api/workouts`, `/api/ai/workouts`
- Schweregrad: mittel
- Auswirkung: Erste Seite mit 50 Workouts à ca. 6 Übungen und 4 Sätzen = rund 1200 Satz-Zeilen mit allen Spalten über die DB-Leitung, dann im Node auf `{ id }` reduziert (Vermutung zu den Zahlen). Läuft bei jedem Cache-Miss (alle 45 s nach Zugriff und nach jeder Mutation).
- Fix-Vorschlag: `include` durch `select` ersetzen: `workoutExercises: { select: { exercise: { select: { id, name } }, sets: { select: { id: true } } }, orderBy }` und Workout-Felder explizit auswählen.
- Aufwand: S
- Verhaltensrisiko: keins (DTO bleibt identisch; Typ `WorkoutListRow` anpassen). Aktualität gleich.

**FT-PERF-09** Root-Layout macht pro Dokument-Request Auth und eine DB-Query und macht alle Seiten dynamisch
- Fundstelle: `src/app/layout.tsx:73` (`await resolveAppLocale()`), `src/lib/i18n-resolve.ts:19-33` (`cookies()`, `auth()`, `$queryRaw` auf `user_settings`), Build-Ausgabe: alle Seiten `ƒ` (dynamisch), nur `/manifest.webmanifest` statisch
- Schweregrad: mittel (Vermutung zur Wirkung)
- Auswirkung: Jede Seite wird je Dokument-Request serverseitig gerendert, wartet auf einen Neon-Round-Trip (Locale) und bleibt uncachebar, obwohl die Seiten selbst Client-Komponenten mit eigenem Fetch sind (`(app)/layout.tsx` Kommentar). Sofort spürbar nur auf Web/PWA (TTFB), nicht in der Native-App (statischer Export).
- Fix-Vorschlag: Locale für Eingeloggte aus dem JWT oder einem Cookie lesen (beim Speichern in Settings Cookie setzen), DB-Query entfernen. Alternativ `React.cache` plus Prisma-Select. Das `$queryRaw` ist wegen veralteter Clients dokumentiert gewählt (Kommentar); mit Cookie entfällt es ganz.
- Aufwand: M
- Verhaltensrisiko: mittel (Locale-Quelle ändert sich; Geräte ohne Cookie fallen zurück). Aktualität: Spracheinstellung wirkt erst nach Cookie-Aktualisierung, Gegenmaßnahme: Cookie beim Settings-Save und bei Login setzen.

**FT-PERF-10** Web-Wasserfall: Session-Fetch vor dem eigentlichen Daten-Fetch
- Fundstelle: `src/components/providers.tsx:19` (`SessionProvider` ohne `session`-Prop), `src/lib/auth/use-auth-gate.ts:53-54` (`status === "loading"` gibt `"checking"`), `src/components/auth/require-auth.tsx` (rendert `null` bis authentifiziert)
- Schweregrad: mittel
- Auswirkung: Auf Web: HTML, dann JS (261-388 KB gzip), dann `GET /api/auth/session`, erst danach rendert die Seite und startet ihren Daten-Fetch (`/api/workouts`). Ein zusätzlicher voller Round-Trip (über Funnel spürbar) vor jedem ersten Inhalt, obwohl das Root-Layout die Session schon kennt (`resolveAppLocale` ruft `auth()`). Native ist nicht betroffen (Keychain-Gate).
- Fix-Vorschlag: `auth()`-Ergebnis im Root-Layout an `<SessionProvider session={...}>` geben (kein Client-Fetch beim ersten Rendern). Mit FT-PERF-09 kombinierbar (ein `auth()` je Request via `React.cache`).
- Aufwand: S
- Verhaltensrisiko: niedrig (statischer Native-Build: `session` dort `undefined` lassen, wie heute). Aktualität gleich.

**FT-PERF-11** (KB-11) `previous-logs-all` bei jedem App-Start und jedem `online`-Ereignis
- Fundstelle: `src/components/previous-logs-cache-warmer.tsx:11-27` (in `Providers`, also in jeder Seite), `src/app/api/workouts/previous-logs-all/route.ts:11-40` (`DISTINCT ON` über alle abgeschlossenen Workouts des Nutzers mit `EXISTS`-Subquery, danach alle Sätze aller letzten Übungen), `src/lib/offline/screen-caches.ts:205` (`bulkPut` aller Übungen)
- Schweregrad: mittel
- Auswirkung: Die Abfrage skaliert mit der gesamten Historie (Scan über `workout_exercises` je Nutzer), läuft bei jedem Kaltstart der App und jedem Netzwechsel, ohne Alterscheck. Konkurriert beim Start mit den ersten Seitenabfragen um Pool und Funnel. Antwort und Dexie-Write wachsen mit der Übungszahl.
- Fix-Vorschlag: Nur starten, wenn der Cache älter als z. B. 30 Minuten ist (`updatedAt` steht in den Cache-Zeilen) oder nach Workout-Abschluss; Ausführung per `requestIdleCallback`/nach dem ersten Seitenrender.
- Aufwand: S
- Verhaltensrisiko: niedrig (Offline-"Letztes Mal" kann bis zum Altersfenster veraltet sein; nach eigenem Abschluss wird ohnehin aufgefrischt). Aktualität: Fenster bewusst festlegen.

**FT-PERF-12** Service-Worker: Network-first ohne Timeout, veraltete Vorlade-Routen
- Fundstelle: `public/sw.js:203-240` (HTML network-first mit `fetch(...)` ohne Timeout, Cache nur im `catch`), `:174-199` (RSC-Anfragen ebenso), `:14-20` (`KEY_ROUTES` mit `/dashboard` und `/body-weight`, die `middleware.ts` auf `/workouts` umleitet), `:225-233` (Fallback `/dashboard`), `src/components/pwa-register.tsx:9-15` (Warm-Routen sind aktuell)
- Schweregrad: mittel (Web/PWA; Native-Bundle nutzt keinen Server-HTML-Pfad)
- Auswirkung: Bei halboffener Verbindung (schlafender Mac, Funnel-Hänger) wartet der Browser bis zum System-Timeout, bevor der Cache-Fallback greift: gefühlt "hängt". Jede RSC-Antwort wird in den Cache geschrieben (`cache.put`) ohne Größen- oder Altersgrenze. Der Fallback `/dashboard` existiert nicht mehr und wird nie getroffen.
- Fix-Vorschlag: `Promise.race` mit 4-5 s Timeout vor dem Cache-Fallback (Navigation und RSC), `/dashboard`, `/body-weight` aus den Listen streichen, RSC-Cache auf N Einträge begrenzen. Version `SW_VERSION`/`CACHE` anheben.
- Aufwand: S
- Verhaltensrisiko: mittel (Offline-Verhalten und Replay; auf Gerät testen). Aktualität: Cache-Fallback greift früher, zeigt dann potenziell ältere Seite statt Warten.

**FT-PERF-13** Bundle-Grundlast und Client-Anteil
- Fundstelle: Messung oben; `src/components/providers.tsx:3-12` (acht Native-Komponenten und `next-auth/react` in jeder Seite), `src/components/app-link.tsx` (Prefetch global aus), 83 von 107 `.tsx`-Dateien sind `"use client"`, `(app)`-Seiten sind reine Client-Seiten (`(app)/workouts/page.tsx:1`), `next.config.ts:15-17` (`optimizePackageImports` für lucide-react/recharts)
- Schweregrad: mittel (Web), niedrig (Native-App, Bundle liegt lokal, nur Parse-Zeit)
- Auswirkung: Mindestens 261 KB gzip auf jeder Route, 388 KB bei `/workouts/new`, ca. 1 MB JS zu parsen (auf dem iPhone ein Parse/Execute-Beitrag; Größenordnung, nicht gemessen). Ohne Prefetch kostet jede Navigation auf Web einen Server-Round-Trip (Grund: Capacitor, siehe `app-link.tsx`; auf Web könnte Prefetch an bleiben). `/login` lädt dieselbe Grundlast wie die App (279 KB).
- Fix-Vorschlag: (1) Native-only-Komponenten (`NativePushRegister`, `NativeHealthSync`, `NativeCalendarSync`, `NativeWatchWorkoutSync`, `NativeWorkoutDeepLink`) hinter `next/dynamic` mit `ssr:false` und `Capacitor.isNativePlatform()`-Prüfung laden; (2) `AppLink` auf Web mit `prefetch` aktivieren (nur Native aus); (3) `workout-detail.tsx` (2259 Zeilen, `/workouts/[id]` 387 KB gzip) per FT-ARCH-25 zerlegen und Schwergewichte (dnd-kit, Notiz-Dialoge) lazy laden; (4) Bundle-Analyse mit `next experimental-analyze` (in Next 16 vorhanden, vor Nutzung Doku `node_modules/next/dist/docs/` prüfen) für modulgenaue Zahlen.
- Aufwand: M
- Verhaltensrisiko: niedrig bis mittel (Lade-Reihenfolge der Native-Hooks, Deep-Link-Kaltstart). Aktualität gleich.

**FT-PERF-14** (KB-G) Selbst-Hosting: Kaltstart ohne Aufwärmen der DB, Standard-Node-Einstellungen
- Fundstelle: `scripts/selfhost.sh:76,99` (`health()` ruft `/`), `:48-53,92-99` (Build im laufenden Dienst, siehe FT-ARCH-20), `:55-76` (kein `NODE_OPTIONS`, keine Heap-Grenze), `package.json` (`"start": "next start"`), `next.config.ts` (kein `output: "standalone"`, `compress` Standard = gzip an)
- Schweregrad: mittel (Vermutung zur Wirkung)
- Auswirkung: Nach `kickstart` ist der erste echte Request der erste DB-Zugriff (Prisma-Client lazy, Pool leer, Neon evtl. suspendiert), er bezahlt Modul-Init plus TCP/TLS plus Compute-Wake: der Handy-Sync direkt nach einem Update wirkt hängend. Der Health-Aufruf `/` berührt für Gäste die DB nicht (`resolveAppLocale` bricht ohne Session ab). `next start` statt Standalone ist funktional gleichwertig (Standalone spart nur Plattenplatz und Startzeit, bei 41 MB `.next/server` und vollem `node_modules` im Rahmen). Standard-Heap von Node reicht für den Bedarf, solange die Export-Routen (siehe -15) klein bleiben. Brotli gibt es bei `next start` nicht (nur gzip); Tailscale Funnel komprimiert selbst nicht (Vermutung).
- Fix-Vorschlag: Nach dem Start `GET /api/health` aufrufen (macht `SELECT 1`, `src/app/api/health/route.ts`) und danach einen leichten authentifizierten Aufruf optional; Neon-Autosuspend am Mac-Betrieb deaktivieren oder verlängern (Neon-Konsole, nicht im Repo); `NODE_OPTIONS=--max-old-space-size=512` in der Plist zur Fehlerbegrenzung. Standalone nicht nötig.
- Aufwand: S
- Verhaltensrisiko: keins (nur Betriebsskript). Aktualität gleich.

---

## Niedrig

**FT-PERF-15** Export-Routen laden die gesamte Historie in einem Aufruf
- Fundstelle: `src/app/api/export/route.ts:5-45` (ein `findUnique` mit allen Workouts, Sätzen, PRs, Körpergewichten), `src/app/api/export/csv/route.ts:14-28` (`findMany` ohne `take`)
- Schweregrad: niedrig (wächst mit den Daten)
- Auswirkung: Ergebnis wird komplett im Speicher gebaut und per `JSON.stringify` serialisiert; das blockiert den einzigen Node-Event-Loop (Selbst-Hosting, eine Instanz) für diese Zeit, auch die 1-s-Polls anderer Clients stocken. Aktuell bei einigen Tausend Sätzen vermutlich im Bereich von zehn bis hundert ms, mit Jahren Daten mehr (Vermutung).
- Fix-Vorschlag: Workouts seitenweise (z. B. 100) laden und als Stream (`ReadableStream`) ausgeben; bei CSV zeilenweise schreiben.
- Aufwand: M
- Verhaltensrisiko: niedrig (Ausgabeformat identisch halten, Test per Vergleich der Bytes).

**FT-PERF-16** Dashboard-Payload: ca. 30 Queries, überlappende Volumenabfragen
- Fundstelle: `src/features/dashboard/queries.ts:75-120` (Summary: 3 Counts + `findMany` auf 5 Jahre), `:146-162` (`getWorkoutVolumesSince`, in `getVolumeBucketsWeekly` und `getVolumeBucketsMonthly` je ausgeführt; der Monatszeitraum enthält den Wochenzeitraum), `:254-262` (alle PRs der Historie), `:652-668` (12 Aufrufe parallel), `src/app/api/dashboard/client-payload/route.ts:15-33`, `src/features/dashboard/training-insights.ts:9-30,73-95` (Sätze im Node aggregiert)
- Schweregrad: niedrig (Seiten sind nach Nexus umgezogen; Nexus cached FitTrack laut dessen CLAUDE.md 15 min; plus `unstable_cache` 45 s)
- Auswirkung: Ein Cache-Miss feuert 25-30 Queries gegen einen Pool von 10 (Queueing, siehe -03); `training-insights` lädt Satz-Zeilen und rechnet im Node statt in SQL. Das ist bereits gut optimiert (SQL-Aggregation für Volumen, `take`-Grenzen), der Rest ist Feinschliff.
- Fix-Vorschlag: Monatsvolumen einmal laden und daraus die Wochenwerte ableiten; die drei Counts per `groupBy`/Aggregat; Streak aus `DISTINCT date_trunc('day', completedAt)`.
- Aufwand: M
- Verhaltensrisiko: niedrig (Rundung/Tagesgrenzen: UTC vs. lokal siehe FT-ARCH-18; Tests vor Umbau). Aktualität gleich.

**FT-PERF-17** `unstable_cache` ist in Next 16 durch `use cache` ersetzt, Cache Components nicht aktiviert
- Fundstelle: `src/features/workouts/workouts-list-data.ts:93`, `src/features/dashboard/queries.ts:632`, `next.config.ts` (kein `cacheComponents`), Doku `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_cache.md` (Hinweis oben)
- Schweregrad: niedrig
- Auswirkung: Funktioniert heute; zwei von mehr als 70 Routen sind gecacht (`revalidate: 45`, Tag-Invalidierung). Der Cache liegt im Dateisystem/Speicher des einen Prozesses und wird beim Neustart (Update) verworfen. Für die API-Routen bringt Cache Components keinen Gewinn, da die Seiten Client-Seiten sind (`ƒ`); die Aktivierung wäre ein Architekturwechsel (Root-Layout liest `cookies()`, siehe -09) und ist nicht empfohlen.
- Fix-Vorschlag: Nichts tun, bis Next die API entfernt; bei Bedarf in `use cache` mit `cacheTag`/`cacheLife` überführen. Kein Handlungsbedarf für Performance.
- Aufwand: S
- Verhaltensrisiko: niedrig (nur bei Migration)

**FT-PERF-18** Proxy (`middleware.ts`) läuft für alle `/api`-Aufrufe und dekodiert die Session doppelt
- Fundstelle: `middleware.ts:10-16` (`auth(...)` wrappt vor der `/api`-Ausnahme), `:36-38` (Matcher schließt `/api` nicht aus), `src/lib/api-auth.ts:20-22` (`auth()` erneut im Handler)
- Schweregrad: niedrig
- Auswirkung: Je API-Request ein zusätzliches JWT-Entschlüsseln (HKDF + AES, Größenordnung Mikro- bis Millisekunden, Vermutung) und eine Middleware-Runde; bei 1-s-Poll und SSE (-02, -04) addiert es sich leicht. Migration zu `proxy.ts` siehe FT-ARCH-23.
- Fix-Vorschlag: Matcher um `api/` erweitern (`"/((?!api/|_next/static|_next/image|favicon.ico|icons).*)"`), da `/api` ohnehin durchgelassen wird; beim Umbenennen zu `proxy.ts` gleich mitnehmen.
- Aufwand: S
- Verhaltensrisiko: niedrig (`/.well-known/` und `/api/auth` laufen weiter durch den Handler; Matcher-Test)

**FT-PERF-19** three.js wird beim ersten PR mitten im Training nachgeladen
- Fundstelle: `src/components/pr-celebration.tsx:16` (`await import("three")`), Chunk 744 KB roh / 186 KB gzip
- Schweregrad: niedrig
- Auswirkung: Gut gelöst (nicht im First Load). Auf Web lädt der Chunk erst beim ersten PR des Geräts und parst 744 KB direkt nach dem Satz-Tap: kurzer Ruckler und Verzögerung der Animation (Vermutung). In der Native-App liegt der Chunk lokal, dort nur Parse-Zeit.
- Fix-Vorschlag: `import("three")` einmal im Leerlauf anstoßen (`requestIdleCallback`), sobald ein Workout aktiv ist, Ergebnis vom Browser cachen lassen.
- Aufwand: S
- Verhaltensrisiko: keins (Animation unverändert). Aktualität gleich.

**FT-PERF-20** Fehlender Index auf `workout_exercises.exerciseId` (und `plan_session_exercises.exerciseId`)
- Fundstelle: `prisma/schema.prisma:289-306` (`WorkoutExercise` hat nur `@@index([workoutId])`), `:243-257` (`PlanSessionExercise` nur `planSessionId`), Abfragen über `exerciseId`: `src/app/api/workouts/[id]/previous-logs/route.ts:53`, `src/features/dashboard/training-insights.ts:73-85`, `src/app/api/exercises/[id]/history`
- Schweregrad: niedrig (kleine Tabellen)
- Auswirkung: Abfragen nach Übung und das Löschen einer Übung (Fremdschlüsselprüfung, `onDelete` für `workout_exercises` ist nicht Cascade) scannen die Tabelle; die meisten Pfade filtern zusätzlich über `workouts.userId` und sind dadurch schon eingegrenzt. Alle anderen Indizes passen zu den Abfragen (`workouts(userId, startedAt|completedAt)`, `sets(workoutExerciseId)`, `personal_records(userId, exerciseId)`, `health_snapshots(userId, date)`, `apple_workouts(userId, startedAt)`). Ob die Indizes in der Produktions-DB wirklich existieren, hängt vom Schema-Drift ab (FT-ARCH-06, ohne DB nicht prüfbar, Vermutung).
- Fix-Vorschlag: `@@index([exerciseId])` auf beiden Modellen per Migration (nicht parallel zu anderen Schema-Änderungen, siehe CLAUDE.md-Regel); zusätzlich `personal_records(userId, achievedAt)` für die "letzte PRs"-Liste (`queries.ts:128-134`), falls Daten wachsen.
- Aufwand: S
- Verhaltensrisiko: keins (nur Index; `CREATE INDEX` kurz sperrend, bei kleiner Tabelle vernachlässigbar). Aktualität gleich.

---

## Geprüft ohne Befund / nur zur Kenntnis
- **Paginierung/Limits:** `/api/workouts` (limit 1-100, Standard 20, Seite geklammert), `/api/health-data` (limit 1-365), `/api/ai/workouts` (wie Workouts) sind begrenzt. Unbegrenzt: Export (-15), `/api/exercises` (ganze Übungsliste, klein), `getStrengthTrendByMuscleGroup` (alle PRs, klein).
- **Aggregation:** Volumen und Top-Übungen laufen bereits per `$queryRaw` in SQL (`queries.ts:146-162,474-494`), gutes Muster; Rest siehe -16.
- **Transaktionen:** nur bei Reorder und Plan-Start; Set-PATCH und Abschluss ohne (siehe -05, -01).
- **Recharts:** korrekt lazy (`dynamic(..., { ssr: false })`, `exercise-detail-analytics.tsx:14-21`), nur in zwei Routen; `optimizePackageImports` gesetzt.
- **Poll-Intervalle (nur lesen):** `active-workout-banner.tsx:97` 90 s (sinnvoll, Event-getrieben), `:122` Watch-Offline 10 s (lokale Bridge, kein Netz), `native-health-sync.tsx:11-12,77` Mindestabstand 15 min, Stunden-Timer, plus `resume`; `native-calendar-sync.tsx:6` 6 h; Rest-Timer tickt nur bei laufendem Timer (`rest-timer-context.tsx:224-227`). Workout-Timer 1 s lokal (`use-workout-timer.ts:17`). Einzig auffällig: 1-s-Poll (-02) und SSE (-04).
- **Watch/HealthKit-Sync:** nur Frequenzen gelesen (siehe oben), Swift nicht bewertet (KB-J).
- **Dexie/Offline-Queue:** Schema-Duplikation ist FT-ARCH-27; zur Laufzeit relevant sind nur die Vollserialisierung je Poll (-02) und `bulkPut` (-11). Queue-Flush läuft seriell, Dauer folgt -05.
- **Auth-Kosten:** Token-Hash ist SHA-256 (schnell), `bcryptjs` nur bei Login/Registrierung (Kosten 12, reines JS, einige hundert ms, einmalig, kein Befund).
- **Schriften/Bilder:** `next/font` self-hosted, keine `next/image`-Nutzung, `public/` 64 KB.

## Mess-Vorschläge (am Mac, lokal, ohne Produktionsdaten in Reports)
1. DB-Latenz: `time psql "$DATABASE_URL" -c 'select 1'` (kalt) und direkt danach nochmal (warm); Differenz = Verbindungsaufbau. Zweimal im Abstand 15 s wiederholen (Pool-Idle, -03).
2. API-Latenz lokal gegen den Dienst: `curl -s -o /dev/null -w '%{time_total}\n' -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3005/api/workouts?limit=50` (Token aus Settings als Umgebungsvariable, nicht in Logs). Über Funnel dieselbe Messung von außen: Differenz = Funnel-Anteil.
3. Abschluss-Dauer: Server-Log (`scripts/selfhost.sh log`) mit `DEBUG`-Zeitstempel je Request oder `prisma` `log: ["query"]` zeitweise lokal aktivieren und die Query-Anzahl für "Workout beenden" und einen Set-PATCH zählen (Soll nach Fix: Abschluss unter 10 Queries).
4. Last durch Poll/SSE: während einer aktiven Einheit und eines offenen Web-Tabs die Queries pro Minute an Neon (Neon-Konsole, Monitoring) ablesen und mit der Schätzung in -02/-04 vergleichen.

## Reihenfolge-Empfehlung (Nutzen zu Risiko)
Sofort und risikoarm: -08, -06, -03, -14, -19, -20, -18. Danach mit Test: -01, -05, -07, -10. Mit Gerätetest: -02 (zusammen mit FT-ARCH-08), -04, -12, -13. Später: -09, -11, -15, -16.
