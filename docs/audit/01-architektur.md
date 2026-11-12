# 01 Architektur-Audit FitTrack (Präfix FT-ARCH-)

Stand: 2026-11-12, nur gelesen (kein Code geändert, keine DB, kein Netzwerk, Swift nicht kompiliert). Next 16.2.2 / React 19.2.4; `proxy.md` aus `node_modules/next/dist/docs/` gelesen.

## Zusammenfassung
1. Offline-Sync ist eine Grundsatzfrage: Op-Log-Replay mit serverseitig vergebenen IDs plus ID-Mapping erzeugt Dubletten und stille Verluste. Es gibt drei verschiedene Sync-Protokolle (IndexedDB-Op-Queue, native Watch-Desired-State, direkte Online-Writes mit 1-s-Polling). Empfehlung: Client-UUIDs und idempotente Batch-Upserts, kein CRDT (siehe Abschnitt Entscheidung).
2. Größte Datenverlust-Pfade: "online" wird nur über `navigator.onLine` erkannt (Mac schläft oder Funnel down: Eingaben gehen verloren), Ops während des Flush landen unter alter ID und werden still verworfen, bei fehlender Snapshot-Zeile wird die Queue als "Erfolg" gelöscht.
3. Schema-Drift: 6 Tabellen, 1 Enum und 1 Spalte (`workouts.restTimerAdjustSeconds`) existieren nur in `schema.prisma`, in keiner Migration. `db-sync-on-build.mjs` lädt `.env` nicht, sodass es auf dem Mac still übersprungen wird; auf Vercel maskiert der db-push-Fallback Fehler.
4. KB-09-Hänger: 1-s-Poll ohne In-Flight-Guard (stapelt Requests bei langsamem Server, 2 DB-Queries/s je Client, wahrscheinlich Treiber von KB-G), `React.memo`-Komparator ignoriert Handler (veraltete Closures), Zustand aus `setState`-Updater gelesen.
5. Betrieb: API-Ursprung an 5 Stellen fest (4x Swift), Rollback auf Vercel nur per Xcode-Neubau; Mac ist Single Point of Failure; `selfhost.sh update` baut im laufenden Dienst, ohne Rollback.

Anzahl: kritisch 2, hoch 9, mittel 10, niedrig 6.

---

## Entscheidung: Ist das Offline-Sync-Design eine Grundsatzfrage?

**Ja, aber mit begrenztem Umfang. Ein volles Sync-Framework oder CRDT ist nicht nötig, ein stärkeres Modell schon.**

Begründung:
- Ursache der Dubletten ist, dass der Server IDs vergibt (`post_workout`, `post_exercise`, `post_set`; Client-IDs werden nicht mitgesendet, `flush-workout-queue.ts:68-110`). Dadurch braucht es `queueIdMap`, Rekeying von Snapshot und Queue (`rekeyWorkoutLocalState`) und 404-Toleranz als Pflaster. Jede dieser Schichten hat ein eigenes Fehlerfenster (FT-ARCH-02, -04, -05, -06).
- Jede Op ist "genau einmal" nur dann, wenn Server-Erfolg und lokales Entfernen atomar wären. Das sind sie nie (zwei Systeme). Deshalb braucht jede Op einen Idempotenzschlüssel. Das lässt sich nicht lokal flicken.
- Es existieren drei parallele Wege, die dieselben Entitäten mit unterschiedlicher Semantik schreiben (Op-Queue JS, Desired-State-Reconcile in `WatchAPIProxy.swift`, direkte Online-Writes). Fixes an einem Weg heilen die anderen nicht.
- Ein Nutzer mit 2-3 Geräten braucht keine CRDTs. Last-write-wins pro Feld mit Zeitstempel reicht.

Vorgeschlagenes Zielmodell (staged, jeweils einzeln releasebar):
1. **Client-generierte UUIDs** für Workout, WorkoutExercise, Set. Server-Create wird `upsert`/`ON CONFLICT DO NOTHING` auf `id` (Besitzprüfung `userId`). `queueIdMap` und Rekeying entfallen.
2. **Ein Batch-Endpunkt** `POST /api/sync` mit `opId` je Op (Dedupe-Tabelle `AppliedOp(userId, opId)`), Antwort pro Op ok/permanent-fehler/transient-fehler.
3. **Dead-Letter** statt Endlos-Blockade: permanente 4xx-Ops werden in eine sichtbare "Konflikte"-Liste verschoben, die Queue läuft weiter.
4. **Gemeinsamer Verbindungs-Zustand** statt `navigator.onLine`: Schreibfehler (Netz/5xx/Timeout) fällt immer auf die lokale Queue zurück.
5. Watch-Pfad später auf denselben Batch-Endpunkt (Desired-State bleibt als Client-Optimierung).

Bis dahin: die Punkte FT-ARCH-01 bis -06 und -13 einzeln als Sofortmaßnahmen (geringes Risiko, kleine Diffs).

---

## Findings

### Kritisch

**FT-ARCH-01** (KB-11, KB-09, KB-F/KB-G)
- Fundstelle: `src/features/workouts/components/workout-detail.tsx:602` (`useLocalWrites` nur aus `navigator.onLine`/Queue), `src/features/workouts/components/set-row.tsx:166-180` (`catch`: nur Toast, kein Queueing, dann `onRefresh`), `workout-detail.tsx:1297-1303` (`addSet` ohne try/catch), `:1220-1244` (`handleAddExercise`), `:1111-1118` (`saveName`), `:1450-1455` (`removeExercise`)
- Schweregrad: kritisch
- Auswirkung: Ist der Server nicht erreichbar, während der Browser "online" meldet (Mac im Ruhezustand, Funnel/TLS-Fehler wie KB-E/F, Neon-Kaltstart, Vercel pausiert), werden Satz-Eingaben nicht in die Offline-Queue geschrieben. Der Code-Kommentar in `set-row.tsx:176` benennt genau diesen Fall, behandelt ihn aber nur mit Toast (und nur bei "abhaken"); das anschließende `onRefresh` lädt Serverstand und überschreibt die getippten Werte. `addSet`/`handleAddExercise`/`generateWarmups` werfen unbehandelt (Promise-Rejection, UI tut nichts). Durch Selbst-Hosting auf dem Mac (KB-G) wird dieser Zustand zum Normalfall.
- Fix-Vorschlag: Zentrale `writeOrQueue(op)`-Funktion: bei fetch-Exception, Timeout (AbortController 8-10 s) oder 5xx/502/503/504 automatisch auf `persistLocal` und `setPendingQueue(true)` umschalten; `netOnline` zusätzlich aus einem Health-Ping (`/api/health`) ableiten. Der Fehlerfall in `set-row.tsx` ruft `offlineHandlers.patchSet` nach.
- Aufwand: M
- Verhaltensrisiko: mittel (Schreibpfad wird umgeleitet; mit Characterization-Test für "fetch rejects" absichern)

**FT-ARCH-02** (KB-11)
- Fundstelle: `src/lib/offline/workout-offline-store.ts:181-210` (`rekeyWorkoutLocalState`), `:172-176` (`distinctQueuedWorkoutIds`), `src/lib/offline/flush-workout-queue.ts:44-47` (Prune ohne Snapshot), `:52-80`; Enqueue durch `workout-detail.tsx:1060-1068` (`persistLocal`, nutzt `workoutId` der Route)
- Schweregrad: kritisch
- Auswirkung: Reconnect im Gym: Der Flush rekeyt nach `post_workout` Queue-Zeilen und Snapshot von lokaler ID auf Server-ID. Tippt der Nutzer währenddessen weiter (die Komponente kennt noch die alte ID, die Navigation folgt erst nach Abschluss), landen neue Ops mit `workoutRouteId = alte ID` in der Queue, nach dem Rekey-Transaktions-Fenster. Beim nächsten Flush findet `distinctQueuedWorkoutIds` die alte ID, `loadWorkoutSnapshot(alteID)` liefert null, und die Zeilen werden als "Erfolg" gelöscht (`:44-47`). Satzdaten sind dauerhaft weg, die UI zeigt "synchronisiert". Zusätzlich überschreibt der Flush-Abschluss (`:190-191`) den lokalen Snapshot mit dem Serverstand und blendet die gerade eingetippten, noch nicht gesendeten Ops aus.
- Fix-Vorschlag: (a) Kurzfristig: Flush pro Workout über Web Lock / In-Memory-Mutex, `enqueueWorkoutOp` schreibt über eine Auflösung `routeId -> aktuelle ID` (Alias-Tabelle `queueAlias(oldId,newId)`). (b) Queue-Zeilen ohne Snapshot nie löschen, sondern aufs Alias-Mapping auflösen oder in Dead-Letter verschieben. (c) Snapshot nach Flush nur überschreiben, wenn die Queue leer ist. Strukturell: Client-UUIDs (siehe Entscheidung), dann entfällt das Rekeying.
- Aufwand: M (kurzfristig), L (strukturell)
- Verhaltensrisiko: mittel

### Hoch

**FT-ARCH-03** Keine Idempotenz, Dubletten (KB-11)
- Fundstelle: `src/lib/offline/flush-workout-queue.ts:61-110` (`post_workout`/`post_exercise`/`post_set` ohne Client-ID/Idempotenzschlüssel; Entfernen erst nach Antwort), `src/lib/offline/__tests__/flush-workout-queue.test.ts:151` (Test belegt Dublette), `ios/App/App/WatchAPIProxy.swift:637-638` (`/api/plan-sessions/<id>/start` ohne Schlüssel; `serverWorkoutId` wird erst nach `queue.removeFirst()` persistiert, `:~700`), `src/app/api/plan-sessions/[sessionId]/start/route.ts:26-34` (legt bei jedem Aufruf ein neues Workout an)
- Schweregrad: hoch
- Auswirkung: Verlorene Antwort (Funnel-Abbruch, App-Kill zwischen Server-Erfolg und lokalem Löschen) erzeugt doppelte Workouts, Übungen oder Sätze. Das Dateikommentar beschreibt eine bereits aufgetretene 10-fache Replikation (`WatchAPIProxy.swift:533-535`); der `FlushGate` fängt nur parallele Läufe, nicht Wiederholung nach Absturz.
- Fix-Vorschlag: Client-UUID als `id` bei allen Create-Endpunkten akzeptieren (Zod `uuid().optional()`, `upsert`), für `start` einen `clientWorkoutId`. Siehe Zielmodell.
- Aufwand: M
- Verhaltensrisiko: niedrig bis mittel (additiv, optionales Feld)

**FT-ARCH-04** `queueIdMap` wird gelöscht, obwohl neue Ops existieren; danach 404 = "Erfolg" (KB-11)
- Fundstelle: `src/lib/offline/flush-workout-queue.ts:186` (`deleteQueueIdMap` am Ende, ohne erneute Queue-Prüfung), `:125`/`:141` (`setMap.get(...) ?? op.clientSetId`), `:130-134` (404 bei `patch_set` gilt als Erfolg), `src/lib/offline/__tests__/flush-workout-queue.test.ts:131`
- Schweregrad: hoch
- Auswirkung: Wurden während des Flush neue Ops (z. B. `patch_set` auf einen im selben Lauf angelegten Satz) enqueued, fehlt im nächsten Lauf das Mapping. Der Satz wird unter seiner Client-UUID gepatcht, der Server antwortet 404, die Op gilt als erledigt: Gewicht/Wiederholungen des Satzes sind verloren. Gleiches Muster bei `delete_we` (404 wird nicht toleriert, blockiert dagegen die Queue dauerhaft, Test `:143`).
- Fix-Vorschlag: Mapping nur löschen, wenn `listQueueForWorkout` leer; 404 nur tolerieren, wenn die ID bewiesenermaßen server-seitig existierte (nicht im Mapping = Client-UUID: Op zurückstellen statt verwerfen). `delete_we` an `delete_set` angleichen. Strukturell durch Client-UUIDs obsolet.
- Aufwand: S
- Verhaltensrisiko: niedrig

**FT-ARCH-05** Queue ohne Snapshot wird still gelöscht und als Erfolg gemeldet (KB-11)
- Fundstelle: `src/lib/offline/flush-workout-queue.ts:39-47`, `src/lib/offline/__tests__/flush-workout-queue.test.ts:65`, `src/components/offline-sync-provider.tsx:82-100`
- Schweregrad: hoch
- Auswirkung: Fehlt die Snapshot-Zeile (Safari/WKWebView-Speicherbereinigung, `JSON.parse`-Fehler in `loadWorkoutSnapshot`, Aliasproblem aus FT-ARCH-02), werden alle Ops gelöscht, der Aufrufer sieht `ok: true`; kein Hinweis für den Nutzer. Die Ops (`patch_set` mit Werten) wären teilweise ohne Snapshot replaybar.
- Fix-Vorschlag: Nicht löschen. In Dead-Letter-Store verschieben und UI-Hinweis "n Änderungen nicht synchronisierbar". `post_workout` braucht Snapshot nur für Rekey (entfällt mit Client-UUIDs).
- Aufwand: S
- Verhaltensrisiko: niedrig

**FT-ARCH-06** Schema-Drift: Migrationen decken `schema.prisma` nicht ab
- Fundstelle: `prisma/schema.prisma:106` (`PushToken`), `:128` (`CardioLiveSnapshot`), `:344` (`BodyMeasurement`), `:377` (`NutritionPlan`), `:366` (Enum `NutritionPhase`), `:398` (`HealthSnapshot`), `:467` (`AppleWorkout`), `:277` (`Workout.restTimerAdjustSeconds`); `prisma/migrations/*` (9 Ordner, `0_init` enthält keine davon)
- Schweregrad: hoch
- Auswirkung: Methode: Tabellen-/Spaltennamen aus `schema.prisma` per Skript gegen alle `migration.sql` geprüft (kein DB-Zugriff). Fehlend: `push_tokens`, `cardio_live_snapshots`, `body_measurements`, `nutrition_plans`, `health_snapshots`, `apple_workouts`, Enum `NutritionPhase`, Spalte `workouts.restTimerAdjustSeconds`. Index-/Constraint-Drift nicht geprüft (Vermutung: ebenfalls vorhanden). Folgen: `migrate deploy` auf einer frischen DB erzeugt ein unvollständiges Schema; `migrate dev` (Shadow-DB) kann nicht sauber arbeiten; CLAUDE.md erklärt "column does not exist" mit `db:push`, was das Muster belegt. Vermutung (ohne DB): Produktion wurde per `db push` aufgebaut, `migrate deploy` scheitert dort mit P3005, und in Wahrheit wirkt jeder Deploy nur über den Fallback. Quelle laut `git log`: `fe1d8c7` (NutritionPlan ohne Migration; `reverse-diet-bulk-plan-masterplan.md` verlangt `migrate dev` durch Robel).
- Fix-Vorschlag: Mit `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` (Shadow-DB lokal) eine Reparatur-Migration erzeugen; auf Prod per `prisma migrate resolve --applied` baselinen. Danach `db push`-Fallback entfernen. Nicht parallel zu anderen Schema-Änderungen (Refactoring-Regel).
- Aufwand: M
- Verhaltensrisiko: mittel (Prod-DB; nur mit Backup/Neon-Branch)

**FT-ARCH-07** `db-sync-on-build.mjs` ignoriert `.env`; Mac-Update überspringt Schema-Sync still
- Fundstelle: `scripts/db-sync-on-build.mjs:16-20` (liest `process.env`, kein `dotenv`), `scripts/selfhost.sh:48-52` (`build()` ruft das Skript ohne `.env` zu laden), `prisma.config.ts:1` (lädt `dotenv/config`, aber erst im Kindprozess)
- Schweregrad: hoch
- Auswirkung: Auf dem Mac steht `DATABASE_URL` nur in `.env`. Das Skript meldet "No DATABASE_URL — skipping schema sync", Exit 0, und `selfhost.sh update` sagt weiter "Schema angleichen". Neue Spalten fehlen, die App wirft "column does not exist" (genau das CLAUDE.md-Symptom).
- Fix-Vorschlag: Im Skript `import "dotenv/config"` (oder in `selfhost.sh` `set -a; source .env; set +a`); bei fehlender URL im Selfhost-Kontext hart abbrechen (`REQUIRE_DB=1`).
- Aufwand: S
- Verhaltensrisiko: niedrig

**FT-ARCH-08** (KB-09, KB-G) 1-s-Poll ohne In-Flight-Guard, mit Kaskaden
- Fundstelle: `workout-detail.tsx:1688-1694` (`setInterval(loadWorkout, 1000)`), `:798-960` (`loadWorkout`: Bridge-Call, IndexedDB-Read, `fetch`, `saveWorkoutSnapshot`, `setWorkout` mit neuem Objekt), `:1637-1650` (Effekt auf `[workout]` ruft jede Sekunde `syncActiveWorkoutToWatch`), `:1662-1683`, `:653-661` (`setExerciseIds` je Poll), `src/app/api/workouts/[id]/route.ts:14-37` (2 DB-Queries je Poll)
- Schweregrad: hoch
- Auswirkung: Bei langsamer Antwort (Neon-Kaltstart, Mac unter Last, Funnel-Latenz) stapeln sich Requests (kein Timeout, kein "läuft schon"-Guard; `isStale` verwirft nur Ergebnisse, nicht Last). Jede Sekunde: neues `workout`-Objekt, Re-Render der Seite, JSON-Serialisierung ans Watch-Plugin, IndexedDB-Write. Eine einstündige Einheit erzeugt rund 3600 GET und 7200 Queries je Client. Vermutung: wesentlicher Beitrag zum Vercel-Fair-Use-Limit (KB-G) und zu KB-09 "hängt". Zusätzlich: eine Antwort, die vor einem eigenen PATCH abgeschickt wurde, aber danach eintrifft, überschreibt den optimistischen Stand (kurzes Zurückspringen).
- Fix-Vorschlag: Poll nur noch mit Watch-Kopplung (native) und dann mit `setTimeout`-Kette (nächster Lauf erst nach Abschluss, Backoff 1 s bis 15 s, `AbortController`-Timeout, pausiert bei `document.hidden`); Server-Seite ETag/`If-None-Match` oder `updatedAt`-Check; Snapshot und Watch-Push nur bei geändertem Inhalt (Hash). Web ohne Watch: kein Poll.
- Aufwand: M
- Verhaltensrisiko: mittel (Watch-Synchronität; manuell auf Gerät testen)

**FT-ARCH-09** (KB-09, KB-11) Veraltete Closures und Zustand aus `setState`-Updater
- Fundstelle: `workout-detail.tsx:484-496` (`memo`-Komparator vergleicht keine Handler-Props: `onAddSet`, `onGenerateWarmups`, `onSetCompleted`, `patchSetOffline`, `deleteSetOffline`, `onRemove`, `onGroupWithNext`), `:1246-1296` (`addSet` baut `next` aus `workout` der Closure und überschreibt per `setWorkout(next)` den ganzen Zustand), `:1070-1083` (`patchSetOffline`: `next` wird im Updater zugewiesen und danach gelesen, `if (next)`)
- Schweregrad: hoch
- Auswirkung: (1) Karten, deren `we` sich nicht geändert hat, behalten Handler aus einem älteren Render. Im Offline-Modus baut z. B. `addSet` auf Übung A den Gesamtzustand aus einem veralteten `workout` und überschreibt damit neuere Änderungen an Übung B in UI und Snapshot (Snapshot-Verlust, Queue hat die Op weiter). (2) React garantiert nicht, dass ein Updater synchron läuft (nur bei leerer Update-Queue, nicht bei schnellen Folge-Taps, nicht in StrictMode-Doppelaufruf); dann ist `next` noch `null`, und `persistLocal` wird übersprungen: Anzeige geändert, Op nie eingereiht. TypeScript merkt das nicht (Narrowing auf `null`/`never` nach Closure-Zuweisung).
- Fix-Vorschlag: Workout-Zustand in `useReducer` mit Aktionen (`SET_PATCHED`, `SET_ADDED`, ...), Persistenz (Snapshot + Queue) als Effekt/Middleware aus dem Reducer-Ergebnis; Handler stabil über `useEvent`-Muster/Ref auf aktuellen Zustand; Komparator entfernen oder um Handler ergänzen.
- Aufwand: M
- Verhaltensrisiko: mittel

**FT-ARCH-10** (KB-G, KB-J) API-Ursprung fest an 5 Stellen; Rollback braucht Neubau
- Fundstelle: `src/lib/constants.ts:12-13` (Default fest, Build-Zeit-Env), `ios/App/App/BackgroundSyncManager.swift:25`, `ios/App/App/CardioPictureInPicturePlugin.swift:73`, `ios/App/App/WatchAPIProxy.swift:39`, `ios/App/App/WatchConnectivityPlugin.swift:62` (jeweils `https://macbook-air-von-robel.tailfff213.ts.net`)
- Schweregrad: hoch
- Auswirkung: Vercel ist bis 10.12.2026 pausiert, der Mac ist der einzige Ursprung. Fällt der Mac oder Funnel aus (oder soll zurück auf Vercel gewechselt werden), müssen App (neu bauen, `NEXT_PUBLIC_API_ORIGIN` wird zur Build-Zeit eingebettet) und 4 Swift-Dateien (Xcode, laut KB-J nie kompiliert) neu ausgeliefert werden. Der statische Native-Build kennt keinen Laufzeit-Wechsel. Außerdem koppelt `native-auth-fetch-patch.tsx:125-141` an `startsWith(PRODUCTION_API_ORIGIN)`.
- Fix-Vorschlag: Eine Quelle: Info.plist-Schlüssel `FitTrackAPIOrigin` (aus xcconfig, gleiche Variable wie `NEXT_PUBLIC_API_ORIGIN`), Swift liest über eine `APIConfig.baseURL`-Struktur (alle 4 Dateien); zusätzlich App-Group-`UserDefaults`-Override und JS-Setter (Capacitor-Plugin `setApiOrigin`) für Laufzeit-Umschaltung. Optional Fallback-Liste `[Mac, Vercel]` mit Health-Check.
- Aufwand: M
- Verhaltensrisiko: mittel (Swift nicht kompilierbar; Review und Xcode-Build durch Robel nötig)

**FT-ARCH-11** (KB-11, Gewicht) Offline-Körpergewicht: Edit geht verloren, Löschen lebt wieder auf
- Fundstelle: `src/lib/offline/flush-body-weight-queue.ts:33-42` (`post` ohne Client-`id`), `:44-60` (`patch`/`delete` mit Client-UUID, 404 wird als Erfolg behandelt), `:61-70` (Entfernen aller Zeilen erst nach der Schleife), `src/lib/offline/__tests__/flush-body-weight-queue.test.ts:50`, `src/app/api/body-weight/route.ts:55-70` (Upsert auf `(userId,date)`)
- Schweregrad: hoch
- Auswirkung: Offline angelegter Eintrag plus korrigierter Wert: der Server bekommt nur den ersten Wert (Test belegt). Offline angelegt und wieder gelöscht: `delete` trifft 404, der von `post` angelegte Server-Eintrag bleibt bestehen und taucht wieder auf. Gewicht ist laut Interview "darf nie verloren gehen". Positiv: Mehrfach-`post` ist wegen Upsert auf Datum idempotent (keine Dubletten bei Prozessende vor dem Entfernen).
- Fix-Vorschlag: Natürlichen Schlüssel `date` nutzen: `PUT /api/body-weight/by-date/<date>` bzw. `DELETE ?date=`; die Queue verdichtet vor dem Senden je Datum (letzte Op gewinnt). Zeilen einzeln direkt nach Erfolg entfernen.
- Aufwand: S
- Verhaltensrisiko: niedrig

### Mittel

**FT-ARCH-12** (KB-09, KB-11) `cancelWorkout` offline löscht nur lokal, Server-Workout bleibt aktiv
- Fundstelle: `workout-detail.tsx:1791-1802` (`useLocalWrites || offlineOriginSession` führt nur `purgeWorkoutLocal` aus), `:602` (`useLocalWrites` ist auch bei online + `pendingQueue` wahr)
- Schweregrad: mittel
- Auswirkung: Hat ein serverseitig existierendes Workout eine ausstehende Queue (online, aber noch nicht geflusht) und der Nutzer bricht ab, wird kein DELETE gesendet: ein "Geister-Workout" bleibt aktiv und erscheint nach dem nächsten Laden wieder (Active-Workout-Banner).
- Fix-Vorschlag: Bei `!offlineOriginSession` zusätzlich `delete_workout`-Op einreihen (oder online DELETE, wenn erreichbar), dann lokal purgen.
- Aufwand: S
- Verhaltensrisiko: niedrig

**FT-ARCH-13** Queue-Sortierung nicht atomar
- Fundstelle: `src/lib/offline/workout-offline-store.ts:12-18` (`nextQueueSort`: `get` + `put` ohne Transaktion), `:52-62`; gleiches Muster `src/lib/offline/body-weight-offline-store.ts:15-21`
- Schweregrad: mittel
- Auswirkung: Zwei gleichzeitige Enqueues (z. B. schnelle Gewicht-/Reps-Edits aus `set-row.tsx`, nicht awaited) erhalten dieselbe `sort`. Die Reihenfolge von `post_set` und `patch_set` auf denselben Satz wird dann durch die zufällige UUID bestimmt; `patch_set` vor `post_set` trifft 404 und wird als Erfolg verworfen (siehe FT-ARCH-04). Häufigkeit: Vermutung (kurze Fenster).
- Fix-Vorschlag: `sort` aus Dexie-Autoincrement (`++seq`) oder `meta.update` in einer `rw`-Transaktion mit Queue-Add.
- Aufwand: S
- Verhaltensrisiko: niedrig (Schemaversion bei Autoincrement nötig; Transaktionsvariante ohne)

**FT-ARCH-14** Offline-Abschluss: Fehler beim Einreihen wird verschluckt
- Fundstelle: `workout-detail.tsx:1488-1507` (`setWorkout(next)` zuerst, dann `try {...} catch { console.error }`)
- Schweregrad: mittel
- Auswirkung: Schlägt `enqueueWorkoutOp({t:"complete_workout"})` fehl (IndexedDB voll/abgebrochen), zeigt die UI "abgeschlossen", die Op existiert nicht; nach dem nächsten Laden ist das Workout wieder aktiv. Kein Nutzerhinweis.
- Fix-Vorschlag: Fehler anzeigen und Abschluss-Zustand zurücknehmen (oder erneut versuchen).
- Aufwand: S
- Verhaltensrisiko: niedrig

**FT-ARCH-15** Permanente Fehler blockieren die Queue, Statusanzeige unzuverlässig (KB-11)
- Fundstelle: `flush-workout-queue.ts:61-171` (jeder nicht-ok-Status außer den 404-Ausnahmen bricht den gesamten Lauf ab), `src/components/offline-sync-provider.tsx:66-72`, `:109`, `:113-116` (Toast bei jedem Lauf; Lauf bei jedem `pathname`-Wechsel; `fittrack-offline-synced` wird auch nach Fehlschlag gefeuert)
- Schweregrad: mittel
- Auswirkung: Eine Op mit 400/403/409 (z. B. Validierungsänderung nach App-Update) blockiert alle folgenden Ops dieses Workouts dauerhaft. Der Toast "Sync failed" erscheint bei jeder Navigation erneut; es gibt keine dauerhafte Statusanzeige (Anzahl ausstehend/fehlgeschlagen), und das Event "synced" wird auch bei Fehlern gesendet, sodass abhängige Komponenten "fertig" annehmen. Kein Backoff, kein fetch-Timeout.
- Fix-Vorschlag: Fehlerklassen (transient: Netz/5xx/Timeout, permanent: 4xx) mit Dead-Letter und Zähler; persistenter Sync-Badge aus Queue-Länge plus letztem Fehler; Event nur bei Erfolg oder mit Payload; exponentielles Backoff.
- Aufwand: M
- Verhaltensrisiko: niedrig

**FT-ARCH-16** Native Watch-Reconcile löscht unmapped Server-Daten
- Fundstelle: `ios/App/App/WatchAPIProxy.swift:705-707` (alle Server-Übungen ohne Mapping werden gelöscht), `:733-739` (dasselbe für Sätze), `:637-638` (Persistenz von `serverWorkoutId` erst nach `removeFirst`)
- Schweregrad: mittel (Vermutung zur Auslösung, Swift nicht kompilierbar/ausgeführt)
- Auswirkung: Das Desired-State-Modell macht den lokalen Stand zur Wahrheit. Wird dasselbe Workout währenddessen online vom Telefon oder einem zweiten Gerät ergänzt (anderer Pfad: direkter REST-Write), löscht der nächste Reconcile diese Server-Übungen/-Sätze. Dazu: zwei Sync-Protokolle für dieselben Entitäten (siehe Entscheidung).
- Fix-Vorschlag: Löschen nur für Einträge mit bekanntem Mapping (explizit lokal entfernte); unbekannte Server-Einträge behalten oder zusammenführen. Beim Umstieg auf Client-UUIDs entfällt das Mapping-Problem.
- Aufwand: M
- Verhaltensrisiko: mittel bis hoch (Watch-Verhalten, keine Kompilierung möglich)

**FT-ARCH-17** (KB-I) HealthSnapshot-Upsert überschreibt blind (Last-write-wins ohne Quelle/Zeit)
- Fundstelle: `src/app/api/health-data/route.ts:565-569` (`upsert(... update: data)`), `:553-557` (ungültiges/fehlendes Datum fällt auf "heute UTC"), `src/app/api/health-data/__tests__/route.test.ts:70-77`; Quellen: `ios/App/App/HealthKitPlugin.swift:91-135`, `:262-266` (Tagessummen aus HealthKit, `strictStartDate`), `src/components/native-health-sync.tsx:57-97` (App-Start, stündlich, resume), Health Auto Export (`route.ts:HAE_METRIC_MAP`)
- Schweregrad: mittel
- Auswirkung: Mehrere Quellen (HealthKit-Plugin, Hintergrund-Sync, HAE, Web-Formular) schreiben dieselben Tageswerte mit unterschiedlicher Vollständigkeit. Jeder Sync ersetzt; ein später, unvollständiger Sync (Watch-Daten noch nicht repliziert) senkt den Wert, ebenso das Löschen eines Trainings in Apple Fitness (HealthKit meldet dann weniger). Das HealthKit-seitige Verhalten ist als Spiegel korrekt, das Produktziel "Tageswert nicht verlieren" ist es nicht.
- Fix-Vorschlag (Merge-Strategie):
  1. Request erhält `source` und `observedAt` (HealthKit: Abfragezeit; HAE: Payload-Zeit). Schema: `HealthSnapshot.fieldMeta Json` (`{feld: {src, at}}`) oder eigene Tabelle `HealthFieldObservation(userId,date,field,value,src,at)`.
  2. Kumulative Felder (`steps`, `activeCalories`, `calories`, `exerciseMinutes`, Intake-Felder): für den **laufenden Tag** `GREATEST(alt, neu)` (Hochwassermarke); für **abgeschlossene Tage** (`date` < heute in Nutzer-Zeitzone) darf ein `authoritative: true`-Vollabzug (Sync ab 00:00 bis 24:00, Quelle HealthKit) auch verringern, einmal pro Tag und mit Protokoll des vorherigen Werts (`activeCaloriesPrev`) für Rückgängig.
  3. Diskrete Felder (`restingHeartRate`, `vo2Max`, `wristTemperature`): neuester `observedAt` gewinnt; `hrv`: Tagesmaximum (wie HAE-Logik). Schlaf: Datensatz mit mehr Stufen/höherer Dauer gewinnt.
  4. Atomar über `INSERT ... ON CONFLICT (userId,date) DO UPDATE SET activeCalories = GREATEST(...)` in einem Raw-Query oder Transaktion mit `SELECT ... FOR UPDATE`. Datumsfallback nicht mehr stillschweigend (400 statt "heute").
- Aufwand: M
- Verhaltensrisiko: mittel (Schema-Änderung, nicht parallel zu FT-ARCH-06; Anzeige kann bei Löschungen vorübergehend höher stehen)

**FT-ARCH-18** Tagesschlüssel UTC vs. lokal; serverzeitabhängige Wochengrenzen
- Fundstelle: `src/features/dashboard/queries.ts:23-24,32` (`computeWorkoutStreak` über `utcDayKey`), `:78,163,173,177,193,220,248,301,507` (date-fns `startOfWeek/startOfDay/startOfMonth` in Serverzeit, danach `utcDayKey`), `src/features/ai/week-stats.ts:8,15,44-54`, `src/features/exercises/history-core.ts:68,91` (Tag aus `toISOString()`), `src/app/api/health-data/route.ts:553-557`, `src/app/api/ai/calendar/route.ts:29` und `src/app/api/mcp/route.ts:429` (Default "heute" in UTC), `src/lib/date-only.ts:36-38` (`formatDateOnlyUtc`; `todayLocalISO` lokal)
- Schweregrad: mittel
- Auswirkung: (a) Training nach 22:00/23:00 Ortszeit (UTC-Vortag) zählt für Serie, Verlaufsdiagramm und "heute" auf den falschen Tag (Off-by-one). (b) Auf Vercel (UTC) bleibt `startOfWeek` = Montag 00:00 UTC; beim Selbst-Hosting auf dem Mac (Europe/Berlin) liefert `startOfWeek` Montag 00:00 lokal = Sonntag 22:00/23:00 UTC, `utcDayKey` ergibt dann den Sonntag: Wochen-Buckets werden um einen Tag verschoben. Das Umziehen auf den Mac (KB-G) ändert also still Dashboard-Zahlen (Vermutung für die konkrete Ausprägung; der Mechanismus ist im Code belegt). Gleiches Muster wie KB-D/KB-04 (Tagesschlüssel/Rundung).
- Fix-Vorschlag: Nutzer-Zeitzone in `UserSettings` (IANA, Default `Europe/Berlin`) und ein einziges Modul `src/lib/day-key.ts` (`dayKeyInTz(date, tz)`, `startOfWeekKey`), alle Stellen darauf umstellen; Server mit `TZ=UTC` betreiben (`selfhost.sh` Plist `TZ`).
- Aufwand: M
- Verhaltensrisiko: mittel (Zahlen ändern sich sichtbar; vorher Characterization-Tests)

**FT-ARCH-19** Vercel-Preview-Deployments und db-push-Fallback gegen geteilte DB
- Fundstelle: `scripts/db-sync-on-build.mjs:28-31`, `vercel.json:2`, `project-docs/deployment.md:103-111`
- Schweregrad: mittel (Vermutung: hängt von der Env-Konfiguration der Preview-Umgebung ab, nicht prüfbar)
- Auswirkung: Jeder Preview-Build führt `migrate deploy`, bei Fehlschlag `db push` aus. Zeigt die Preview-Umgebung auf die Produktions-DB, verändert ein Feature-Branch das Produktionsschema. Der Fallback verdeckt zudem echte Migrationsfehler (fehlgeschlagene Migration P3009, Sperre/Timeout) und erzeugt weiteren Drift (FT-ARCH-06).
- Fix-Vorschlag: Fallback nur bei P3005 und nur mit explizitem `ALLOW_DB_PUSH=1`; Preview-Env auf eigene Neon-Branch-DB; Skript bricht bei Preview ohne eigene DB ab.
- Aufwand: S
- Verhaltensrisiko: niedrig

**FT-ARCH-20** (KB-G) Selbst-Hosting: Update im laufenden Dienst, kein Rollback, Ruhezustand, Port/Host-Kollision
- Fundstelle: `scripts/selfhost.sh:48-53` (`build()`: `npm install` + Build in-place), `:92-99` (`update`: `git pull` (Merge, aktueller Branch), Build, dann `kickstart`), `:55-76` (`write_plist`: `KeepAlive`, kein `TZ`, keine Log-Rotation), `:77-82` (`funnel_on`: `serve --https=443 off`), `prod.sh:3` (fester Port 3005), `dev.sh:3` (`--hostname 0.0.0.0`), `/home/user/own-game/CLAUDE.md` (Nexus unter demselben Hostnamen)
- Schweregrad: mittel
- Auswirkung: (1) `next build` überschreibt `.next`, während `next start` weiterläuft: Anfragen im Build-Fenster können fehlende Chunks treffen; scheitert der Build, bleibt ein halbfertiges `.next` zurück und der Dienst läuft damit weiter. Kein gemerkter letzter guter Commit/Build, kein Rollback-Kommando. (2) `npm install` statt `npm ci` verändert `package-lock.json` und blockiert später `git pull`. (3) LaunchAgent läuft nur bei angemeldetem Benutzer und nicht im Ruhezustand: Mac schläft = FitTrack, Watch-Proxy und Hintergrund-Sync sind weg (SPOF, siehe FT-ARCH-10); keine Wach-Konfiguration (`caffeinate -s`/`pmset`) im Skript. (4) `prod.sh` startet denselben Port 3005 wie der Dienst: Doppelstart führt zu `EADDRINUSE`, bei `KeepAlive` zu Neustart-Schleifen des Dienstes bzw. Verwirrung. (5) Funnel auf 443 nimmt `serve` auf 443 weg; Nexus (`own-game/CLAUDE.md`) hängt laut Doku am selben Hostnamen, jetzt nur noch über `:10000` erreichbar. Vermutung, dass das mit KB-E/KB-F (TLS-/Verbindungsfehler, ältere URLs/Zertifikat-Erwartungen im Handy) zusammenhängt; nicht belegbar ohne Gerät. (6) `need_env` prüft `DIRECT_DATABASE_URL` nicht, das Prisma für Migrationen bevorzugt.
- Fix-Vorschlag: Build in `.next-new`/separates Verzeichnis und Tausch, oder Build vor Stop; vorheriges Release (`git rev-parse HEAD`, `.next`-Backup) für `selfhost.sh rollback`; `npm ci`; `git pull --ff-only`; `TZ=UTC` in der Plist; `caffeinate`-LaunchAgent oder `pmset`-Hinweis; `prod.sh`/`dev.sh` prüfen Port (`lsof`) bzw. entfernen; Health-Monitor (externer Ping) für den Funnel.
- Aufwand: M
- Verhaltensrisiko: niedrig (nur Betriebsskripte)

**FT-ARCH-21** Server-Last und Zuverlässigkeit: keine fetch-Timeouts, Doppelbild mit Neon
- Fundstelle: `workout-detail.tsx` (alle `fetch`-Aufrufe ohne `AbortController`, z. B. `:848`, `:890`, `:1030`), `src/lib/offline/flush-workout-queue.ts:50-52` (`api`-Helper ohne Timeout)
- Schweregrad: mittel
- Auswirkung: Halboffene Verbindungen (Funnel, schlafender Mac) hängen bis zum Systemtimeout; `completing`/`savingName` bleiben gesetzt, der Flush blockiert (`busy`-Ref bleibt true) bis zum Ende. Verstärkt FT-ARCH-01 und -08.
- Fix-Vorschlag: Gemeinsamer `fetchWithTimeout` (8-10 s, Retry mit Backoff) in `src/lib/api/`, Nutzung in Flush und Workout-Detail.
- Aufwand: S
- Verhaltensrisiko: niedrig

### Niedrig

**FT-ARCH-22** Doku-Drift in CLAUDE.md und README
- Fundstelle: `CLAUDE.md` (Tech Stack: "Next.js 14", "Mobile: ... no native iOS shell", "Server actions for mutations"), `package.json` (next 16.2.2, react 19.2.4, Capacitor 8, Prisma 7, zod 4), `capacitor.config.ts`, `ios/App/*`, `README.md` (create-next-app-Boilerplate), `project-docs/deployment.md` (Vercel-Fokus, kein Selfhost), `src/` (kein `"use server"`; Mutationen laufen über Route-Handler)
- Schweregrad: niedrig
- Auswirkung: Agenten und Leser bekommen falsche Annahmen (Next 14 vs. 16: `params` ist ein Promise, `middleware` ist veraltet, `revalidateTag` mit 2 Argumenten). `AGENTS.md` warnt davor, CLAUDE.md widerspricht dem.
- Fix-Vorschlag: CLAUDE.md aktualisieren (Next 16, Capacitor-iOS-App mit Watch/Widget, Mutationen per Route-Handler + `withApi`, Selfhost auf Mac, `db-sync`), README auf Projektbeschreibung kürzen, `project-docs/deployment.md` um Selfhost und Rollback ergänzen.
- Aufwand: S
- Verhaltensrisiko: keins

**FT-ARCH-23** `middleware.ts` ist in Next 16 veraltet (umbenannt in `proxy.ts`)
- Fundstelle: `/home/user/fittrack-pro/middleware.ts`, `scripts/build-native.mjs:32-34` (verschiebt `middleware.ts`), `next.config.ts` (Kommentar), `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
- Schweregrad: niedrig
- Auswirkung: Funktioniert derzeit mit Deprecation-Hinweis; die Datei muss beim Umbenennen auch in `build-native.mjs` (`MOVES`) und in den Kommentaren angepasst werden, sonst bricht der Native-Build. Hinweis: `proxy` läuft auf Node-Runtime, nicht Edge (prüfen, ob `auth.config` das verträgt).
- Fix-Vorschlag: Mit dem offiziellen Codemod migrieren, `MOVES` anpassen, Native-Build testen.
- Aufwand: S
- Verhaltensrisiko: niedrig bis mittel (Auth-Weiterleitungen)

**FT-ARCH-24** Schichtung features/services/lib: Verstöße und Duplikate
- Fundstelle: 53 von 80 Route-Handlern (`src/app/api/**`) importieren `@/lib/prisma` direkt; `src/services/` hat nur 2 Dateien (`muscle-heatmap.ts`, `personal-records.ts`), 16 Dateien in `features/` und Seiten nutzen ebenfalls Prisma; `src/lib/native/watch-connectivity.ts:4-8` und `watch-workout-sync.ts:11-15` importieren Laufzeitcode aus `features/workouts` (`superset-utils`, `set-sort`, `progression`) und `features/health/recovery`, `src/lib/offline/*` importiert Typen aus `features/workouts` (typ-only, zur Laufzeit gelöscht); Feature-Kreuzimporte: `workouts -> cardio/tools`, `ai -> health/dashboard`, `plans -> workouts`, `calendar -> dashboard`, `settings -> calendar` (keine Zyklen gefunden, per Lektüre/Import-Scan)
- Duplikate: `utcDayKey` (`dashboard/queries.ts:23`, `ai/week-stats.ts:8`) und `dateKey` (`health/weight-trend.ts:66`), `startOfIsoWeek` (`health/cardio.ts:119`, `health/weight-trend.ts:71`), `formatDuration` (`workout-detail.tsx:148`, `workout-history-list.tsx:40`), 1RM-Formel (`lib/strength.ts:2-4` und `exercises/components/one-rm-calculator.tsx:10`)
- Schweregrad: niedrig
- Auswirkung: Geschäftslogik liegt verteilt in Routen und Feature-Queries; Tagesschlüssel-Fehler (FT-ARCH-18) müssen an mehreren Stellen gefixt werden. Keine Zyklen, daher kein akutes Risiko.
- Fix-Vorschlag: `lib/` auf Basis (kein Import aus `features/`): Typen und reine Funktionen nach `src/lib/workout/` oder `src/features/workouts/` mit klarer Richtung (features -> lib). Duplikate in `src/lib/day-key.ts`, `src/lib/strength.ts`, `src/lib/format.ts` zusammenführen. Route-Handler schrittweise auf `src/services/*` verdünnen (opportunistisch, nicht als Großumbau). ESLint-Regel `no-restricted-imports` für `lib -> features`.
- Aufwand: M
- Verhaltensrisiko: niedrig

**FT-ARCH-25** Zerlegung von `workout-detail.tsx` (KB-09), Vorschlag
- Fundstelle: `src/features/workouts/components/workout-detail.tsx` (2259 Zeilen: eine Komponente `WorkoutDetail` über Zeilen 507-2259; 25 `useState`, 15 `useEffect`, 11 `useRef`, 7 `useCallback/useMemo`; `SortableExerciseCard` `:309-496`)
- Schweregrad: niedrig (Wartbarkeit; die Laufzeitfolgen sind in FT-ARCH-01/-08/-09 erfasst)
- Auswirkung: Zustandsmaschine (online / lokal / native Watch / Rekey-Redirect) ist über Flags (`nativeWatchOffline`, `offlineOriginSession`, `pendingQueue`, `netOnline`, `rekeyRedirecting`) verteilt; jede Mutation hat drei Zweige (online, lokal, Watch) mit kopierter Logik (`addSet`, `generateWarmups`, `removeExercise`, `setSupersetGroups` ...).
- Fix-Vorschlag (Zerlegung, jeweils eigener Commit, Reihenfolge nach Risiko):
  1. Reine Funktionen und Typen auslösen: `workout-detail-utils.ts` (`formatDuration`, `formatShortDate`, `mapApiSet`, `patchSetInWorkout`, `renumberSets`, `workoutAsPreviousLogs`, `deriveProgressions`, `nativeWatchPendingToWorkout`), mit Vitest-Tests (heute keine).
  2. `exercise-card.tsx` (`SortableExerciseCard`) ausziehen, Handler-Props typisiert und stabil.
  3. `use-confirm.tsx` (ersetzt `askConfirm` + Dialog `:2222-2255`) und `completion-summary-dialog.tsx` (`:2111-2220`).
  4. `use-workout-data.ts`: `loadWorkout`, Polling, Snapshot, Rekey-Redirect (`:798-1003`), mit `useReducer`-Zustand statt `useState`-Geflecht (FT-ARCH-09).
  5. `workout-writer.ts`: Schnittstelle `WorkoutWriter { addSet, patchSet, deleteSet, addExercise, removeExercise, setSuperset, complete, cancel }` mit drei Implementierungen (`ServerWriter`, `LocalQueueWriter`, `NativeWatchWriter`), Auswahl per Verbindungszustand (FT-ARCH-01). Beseitigt die dreifach kopierten Zweige.
  6. `use-watch-sync.ts` (`wokenWatchWorkoutIds`, Push-Effekte, Rest-Timer-Erkennung `:663-716`, `:1580-1683`) und `use-rest-timer-coordination.ts`.
  7. `workout-header.tsx` (Kopf/Name/Timer/Menü `:1886-1975`).
- Aufwand: L
- Verhaltensrisiko: mittel (Schritte 1-3 niedrig; 4-6 mit Gerätetest)

**FT-ARCH-26** Repo-Hygiene
- Fundstelle: `git ls-files`: `erstelle-absoluten-masterplan-der-nifty-reef.md` (4 KB) und `reverse-diet-bulk-plan-masterplan.md` (30 KB) im Root getrackt (Planungsdokumente für Codex, laut `git log` von Commit `fe1d8c7`); `.idea/*` getrackt; `.claude/settings.local.json` getrackt (enthält Host-Namen älterer Vercel-Deployments und Shell-Freigaben, keine Tokens gefunden); `Fitapp/` (13 Dateien, Design-Prototyp); `tsconfig.tsbuildinfo` liegt lokal vor, ist aber ignoriert (`.gitignore:44`) und **nicht** getrackt (kein Befund); `src/generated/prisma` ist ignoriert (korrekt)
- Schweregrad: niedrig
- Auswirkung: Rauschen im Root, lokale Einstellungen im Repo, IDE-Dateien.
- Fix-Vorschlag: Masterplan-Dateien nach `project-docs/plans/` verschieben (oder löschen, nur mit Robels OK), `.idea/` und `.claude/settings.local.json` in `.gitignore` und `git rm --cached`.
- Aufwand: S
- Verhaltensrisiko: keins

**FT-ARCH-27** Offline-DB-Schema: Duplikation und totes Schema
- Fundstelle: `src/lib/offline/db.ts:127-343` (jede Dexie-Version wiederholt das gesamte Schema, 11 Versionsblöcke), `:108-113` und `:341` (`progressionCache` laut Kommentar nicht mehr gelesen oder geschrieben, Tabelle bleibt)
- Schweregrad: niedrig
- Auswirkung: Wartungsaufwand; Fehlerrisiko beim nächsten Versionsblock; ungenutzte Tabelle.
- Fix-Vorschlag: Nur geänderte Stores je `version()` angeben (Dexie vererbt), `progressionCache` mit `null` in einem neuen Versionsblock löschen.
- Aufwand: S
- Verhaltensrisiko: niedrig

---

## Offene Punkte / nicht geprüft
- Produktions-DB-Stand (`_prisma_migrations`, Indizes): ohne DB-Zugriff nicht prüfbar; FT-ARCH-06/-19 sind Code-Befunde, Prod-Zustand ist Vermutung.
- `WatchAPIProxy.swift` und `WatchConnectivityPlugin.swift`: nur die Replay-/Reconcile-Pfade gelesen (Zeilen 533-800), nicht kompiliert.
- Serverseitige Routen unter `src/app/api/workouts/[id]/sets|exercises` auf Konfliktverhalten (PATCH ohne Version) nur oberflächlich gelesen.
- Mehr-Tab-Verhalten (zwei Browser-Tabs flushen parallel, `busy` ist nur ein Ref je Komponente): im Code erkennbar (`offline-sync-provider.tsx:23`), nicht separat bewertet; mit Web Lock (`navigator.locks`) in FT-ARCH-02 abgedeckt.
