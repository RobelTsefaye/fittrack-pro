# Review Phase 6 (Gegenprüfung) FitTrack

Stand 2026-11-12. Branch `refactor/audit-2026-11` gegen lokales `main` (`git diff main...HEAD`, 29 Commits, 64 Dateien). Unabhängiger Review, nur gelesen und Prüfbefehle ausgeführt; kein Code geändert. Zeilennummern beziehen sich auf den Stand von `HEAD` (`bf90e8f`).

## Gesamturteil

**Beanstandungen (keine Freigabe in der vorliegenden Form).** Umfang, Prisma, CI, Abhängigkeiten, Auth-Abdeckung und Prüfläufe sind sauber. Es gibt einen sichtbaren Fehler in der UI (falscher Fehler-Toast nach erfolgreichem Einreihen), einen neu erreichbaren Pfad, der die Offline-Queue dauerhaft blockiert (`delete_we` + 404 nach Timeout), eine Lücke in der Alias-Logik, fehlende `project-docs`-Pflege und zwei Hygienepunkte. P1 ist bis auf die Doku freigabefähig.

## Übersicht

| # | Prüfpunkt | Ergebnis | Beleg / Grund |
|---|---|---|---|
| 1a | Umfang: nur freigegebene Produktivdateien | OK | Diff ohne Tests/Doku: `.nvmrc`, `CLAUDE.md`, `set-row.tsx`, `workout-detail.tsx`, `guarded-poll.ts`, `offline/db.ts`, `flush-workout-queue.ts`, `workout-offline-store.ts`, `write-or-queue.ts`, `prisma.ts`. Sonst nichts. |
| 1b | `git diff main...HEAD -- prisma` | OK | leer |
| 1c | B3 Verhaltensgleichheit Offline-Sync | **Beanstandung** | B-1, B-2, B-3 unten |
| 1d | P1 Poll-Guard / Race | OK | `isStale()` per Request-ID (`workout-detail.tsx:820-821`), neue Ticks erhöhen die ID, alte Antwort nach Timeout wird verworfen |
| 1e | P1 `PrismaPg({connectionString, idleTimeoutMillis})` | OK | `@prisma/adapter-pg` 7.6.0: `constructor(poolOrConfig: pg.Pool \| pg.PoolConfig \| string, …)` (`dist/index.d.ts:42`); String wurde bisher zu `{ connectionString }` (`dist/index.js:775-777`), also identisch plus `idleTimeoutMillis` (pg-pool-Default 10 000, `pg-pool/index.js:98-99`) |
| 1f | i18n `common.saveFailed` | OK | `de.json:42`, `en.json:42` (Namespace `common`); zusätzlich gleichnamige Schlüssel in anderen Namespaces (152, 853), unkritisch |
| 1g | Unbeabsichtigte UI-Änderungen | **Beanstandung** | B-1 (falscher Toast); Hinweise H-1, H-2 |
| 2 | `npm test` | OK | 39 Dateien grün, 1 übersprungen; 393 Tests grün, 11 todo (404 gesamt) |
| 2 | `npm run typecheck` | OK | Exit 0 |
| 2 | `npm run lint` | OK | Exit 0, keine Ausgabe |
| 2 | `npm run build` (CI-Platzhalter-Env) | OK | „Compiled successfully“, 74/74 statische Seiten, Exit 0, keine Warnungen. `build:native` bewusst nicht ausgeführt |
| 3 | Auth-Wrapper aller `route.ts` | OK | `route-auth-coverage.test.ts` grün (9 Tests); `git diff main...HEAD -- src/app` enthält nur `__tests__`; ALLOWLIST seit Baseline `4658f30` unverändert, einzige Änderung: `it.todo` „UNKLAR ist leer“ zu echtem Test (`:169-171`, strenger) |
| 4 | Geheimnisse im Diff | OK | Musterprüfung ohne Treffer (nur `ci:ci@localhost` im Build-Befehl, nicht im Diff); gitleaks-Reports in `docs/audit/tools/` sind redigiert (`Secret`/`Match` = REDACTED, 11 Einträge) |
| 4 | `.claude/settings.local.json` | OK | nicht im Diff |
| 4 | `.github` | OK | `git diff main...HEAD -- .github` leer |
| 5 | Neue Abhängigkeiten | OK | `package.json`, `package-lock.json` unverändert |
| 5 | XSS | OK | keine neuen `dangerouslySetInnerHTML`/HTML-Strings; Toasts über `t()` |
| 5 | Offline-Queue ohne Auth | OK (unverändert) | Replay nutzt `credentials: "include"` bzw. `NativeAuthFetchPatch`, Server prüft Auth je Route. Queue ist nicht an den Nutzer gebunden (Altbestand, nicht durch diesen Diff) |
| 5 | IndexedDB-Feld `aliasOf` ohne Versionsbump | OK | nicht indiziert (`db.ts:122-127`), Dexie braucht dafür keine neue Version; alte Zeilen ohne Feld → `resolveWorkoutAlias` liefert `null`; ältere App-Version liest Alias-Zeile als leere Maps („[]“) |
| 6 | Doku `project-docs/` | **Beanstandung** | B-4 |
| 7 | Trailer in jedem Commit | **Beanstandung** | B-5: `8b72d24` ohne `Co-Authored-By` |
| 7 | Keine Modellnamen in Code/Doku | **Beanstandung** | B-6: `docs/audit/07-fehlerbehandlung.md:130` |
| – | iPhone/WKWebView, Watch, Mac-Betrieb, Neon | nicht prüfbar | siehe Abschnitt „Nicht geprüft“ |

## Beanstandungen

### B-1 (mittel, UI) Fehler-Toast obwohl der Satz eingereiht wurde
`src/features/workouts/components/workout-detail.tsx:1348-1351`: `if (outcome.kind !== "response" || !outcome.res.ok)` trifft auch `kind === "queued"`. Bei Netzfehler/502/503 legt `addSet(weId, isWarmup, true)` den Satz lokal an und reiht ihn ein, danach erscheint trotzdem „Speichern fehlgeschlagen. Prüfe deine Verbindung.“ Der Nutzer tippt erneut auf „+ Satz“ und erzeugt einen zweiten Satz. `handleAddExercise` macht es richtig (`:1260` prüft `queued` zuerst).
**Forderung:** vor `:1348` `if (outcome.kind === "queued") return;` ergänzen; Komponententest oder mindestens ein Unit-Test für die Ergebnisbehandlung.

### B-2 (hoch, Datenpfad) `delete_we` nach Timeout blockiert die Queue dauerhaft
`workout-detail.tsx:1499-1516` reiht `DELETE /api/workouts/:id/exercises/:weId` bei Timeout (10 s, `write-or-queue.ts:8`) und jedem 5xx ein. Hat der Server die Löschung trotzdem ausgeführt, antwortet der Replay mit 404 (`src/app/api/workouts/[id]/exercises/[weId]/route.ts`, „Exercise not found in workout“), und `flush-workout-queue.ts:173` wirft `delete_we 404` (anders als `delete_set` `:163` und `patch_set` `:152`). Alle späteren Ops dieses Workouts bleiben stehen, bei jedem Lauf „Sync failed: delete_we 404“. Der Test `flush-workout-queue.test.ts:173` dokumentiert die Inkonsistenz als IST; vor diesem Diff war der Pfad nur offline erreichbar, jetzt auch online.
**Forderung:** entweder `delete_we` im Flush wie `delete_set` 404 tolerieren (Charakterisierungstest umdrehen) oder DELETE nur bei echtem Netzfehler/502/503 einreihen (wie `CREATE_WRITE`). Entscheidung dokumentieren.

### B-3 (mittel, Datenpfad) Alias-Pfad löscht die ID-Maps, die er schützen soll
`flush-workout-queue.ts:48-52` ruft beim Alias `flushWorkoutQueue(alias)` auf; dort ist `routeWorkoutId === currentId`, also löscht `:215` die Map des neuen Workouts. Der Kommentar `:212-214` sagt, sie werde für späte Ops unter der alten ID gebraucht. Ablauf: Flush 1 rekeyt (Map bleibt), späte Op unter alter ID → Flush 2 folgt dem Alias und löscht die Map → weitere Op der noch offenen alten Ansicht mit Client-ID → `patch_set` an eine unbekannte ID → 404 → still als Erfolg entfernt (`:152`), `post_set` → 404 → Queue blockiert. Fenster ist klein (bis `router.replace` in `offline-sync-provider.tsx:98`), aber genau der KB-11-Fall. Der Test `:266` deckt das nicht ab (nutzt bereits eine Server-ID `srv-set`, Store gemockt). Außerdem werden Alias-Zeilen nie entfernt (`workout-offline-store.ts:209`; nur `purgeWorkoutLocal` löscht die eigene ID).
**Forderung:** Map im Alias-Pfad nicht löschen (z. B. Parameter `keepIdMap` oder Löschen erst beim Entfernen der Alias-Zeile), Test mit Client-IDs über zwei Alias-Flushes; Aufräumregel für Alias-Zeilen festlegen (z. B. beim Löschen der Map des Ziels).

### B-4 (Doku) `project-docs/` nicht nachgezogen
CLAUDE.md verlangt Pflege; `git diff main...HEAD -- project-docs` ist leer. `project-docs/offline-first-roadmap.md:71-72` beschreibt den Schreibpfad nur über `navigator.onLine`/`useLocalWrites`.
**Forderung (Vorschlag):** in `offline-first-roadmap.md` einen Abschnitt „Audit 2026-11“ mit: `writeOrQueue` (PATCH/DELETE 10 s Timeout + 5xx einreihen; Anlege-POSTs ohne Timeout, nur Netzfehler/502/503, sonst Toast), Queue ohne Snapshot bleibt (`no_snapshot`, kein stilles Löschen mehr), Alias `aliasOf` nach Rekey, Runden bis `MAX_ROUNDS = 20` / `queue_busy`; Poll mit In-Flight-Guard und 10-s-Abbruch (`src/lib/guarded-poll.ts`) in `performance-plan.md` bzw. `apple-watch.md` (Watch-Sync über den 1-s-Poll); `idleTimeoutMillis: 60_000` in `deployment.md`/`architecture.md`.

### B-5 (Hygiene) Commit ohne vollständigen Trailer
`8b72d24` („Node-Version festlegen: .nvmrc …“) hat nur `Claude-Session:`, kein `Co-Authored-By:`. Alle anderen 28 Commits haben beide Zeilen.
**Forderung:** beim nächsten Rebase/Squash ergänzen oder als bekannte Ausnahme in `docs/audit/` vermerken (kein Force-Push ohne Robel).

### B-6 (Hygiene) Modellkennung in der Doku
`docs/audit/07-fehlerbehandlung.md:130` zitiert die konkrete Modellkennung aus `src/app/api/chat/route.ts:114`. Regel: keine Modellnamen in Doku.
**Forderung:** durch „Modell-Alias des Anbieters (siehe `chat/route.ts:114`)“ ersetzen. Anbieternamen (Google-KI als Abhängigkeit) in `02-security.md`/`TRIAGE.md` sind Produkt-/Anbieterangaben und können bleiben, wenn Robel das so sieht.

## Hinweise (keine Blocker)

- **H-1 Kein Flush, solange die Seite online offen bleibt.** Nach einem Fallback-Einreihen setzt `persistLocal` `pendingQueue` (`workout-detail.tsx:1080`), damit `useLocalWrites` (`:612`); geflusht wird nur bei Mount/Navigation, `online` und `resume` (`offline-sync-provider.tsx:66, 135, 145`). Während des Trainings bleibt das Workout lokal, der 1-s-Poll liefert nur den Snapshot (`:843-853`), Watch-Sätze erscheinen nicht. Besser als vorher (Eingabe ging verloren), aber Gerätetest und ggf. Retry-Timer (Folge-Fix, FT-ARCH-15) nötig.
- **H-2 `no_snapshot` meldet dauerhaft.** `flush-workout-queue.ts:57` liefert jetzt `ok:false`; `offline-sync-provider.tsx:69` zeigt bei jeder Navigation „Sync failed: no_snapshot“, falls auf dem iPhone verwaiste Zeilen alter App-Versionen liegen. Gewollt (FT-ARCH-05), braucht aber einen Ausweg (Dead-Letter/Anzeige, FT-ARCH-15) und einen Satz in KNOWN-BUGS/Doku.
- **H-3 Timeout auch ohne `queueFallback`.** `set-row.tsx:177-187` bricht PATCH jetzt nach 10 s ab, auch wenn kein Fallback übergeben wird (abgeschlossene Workouts, `reviseCompletedSets`); vorher wurde gewartet. Folge: stiller `onRefresh` statt spätem Erfolg (bei `complete=false` ohne Toast, `:195-199`).
- **H-4 Replay idempotenter Schreiber nach Timeout.** PATCH Satz/Name sind wiederholbar; ob ein doppelter `isCompleted: true` Rekord-/PR-Logik doppelt auslöst, wurde nicht geprüft (FT-PERF-01/FT-ERR-02).
- **H-5 Stale Closures in Fallbacks.** `workout-detail.tsx:1136-1140` (`{...workout, name}`) und `:1506-1513` bauen den Snapshot aus dem Render-`workout` (FT-ARCH-09, Altbestand-Muster).
- **H-6 Werkzeug-Ausgaben mit lokalen Pfaden.** `docs/audit/tools/semgrep.json` enthält Regel-IDs mit dem absoluten Scratchpad-Pfad der Audit-Umgebung; kosmetisch, ggf. bereinigen.
- **H-7 Tests mit gemocktem Store.** Die Offline-Tests mocken `workout-offline-store` (`flush-workout-queue.test.ts:21`); Dexie-Transaktionen (`rekeyWorkoutLocalState`, `moveQueueEntries`) laufen nicht echt (fake-indexeddb nicht freigegeben, Entscheidung Nr. 20).

## B3 (FT-ARCH-01/-02/-05, KB-11): Beanstandung

Geprüft je Hunk:
- `write-or-queue.ts:1-78` (neu): Logik korrekt; `CREATE_WRITE` = kein Timeout, nur `fetch`-Fehler/502/503 (`:36`); ohne Callback bleibt 5xx eine Antwort wie bisher (`:69-71`); Einreihfehler → `failed` (`:76`). Tests `write-or-queue.test.ts` decken das ab.
- `flush-workout-queue.ts:66-208`: Runden-Schleife über `listQueueForWorkout(currentId)`, Umhängen später Ops (`:200-202`), `queue_busy` nach 20 Runden mit erhaltener Map (`:208`, Test `:283`); Op-Fälle selbst unverändert (nur eingerückt, verglichen). Kein Verlust von Queue-Zeilen im geprüften Ablauf außer B-3.
- `flush-workout-queue.ts:44-57`: kein stilles Löschen mehr (FT-ARCH-05), Alias-Folge (B-3).
- `workout-offline-store.ts:207-232`: Alias-Zeile im selben Transaktionsscope wie der Rekey (atomar), `moveQueueEntries` in eigener Transaktion, `sort` bleibt.
- `db.ts:122-127`: nur Typfeld.
- `set-row.tsx:54-60, 175-203, 236-251` und `workout-detail.tsx:458-465, 1093-1098, 1127-1143, 1247-1277, 1335-1351, 1499-1516`: Schreibpfade über `writeOrQueue`; `patchSetOffline` reiht nicht mehr abhängig vom Lazy-Updater ein (`:1093-1098`, FT-ARCH-09-Teil, korrekt). Fehler B-1, B-2.
- WatchOfflineWorkoutStore (Swift) liest/schreibt diese IndexedDB nicht (kein Treffer für `queueIdMap`/`aliasOf` unter `ios/`); nativer Pfad `nativeWatchOffline` in `persistLocal` (`:1074-1077`) unverändert.

**Forderung für Freigabe:** B-1 und B-2 beheben, B-3 beheben oder als bekanntes Restrisiko mit Test (IST) dokumentieren, B-4 nachziehen. Danach Gerätetest „Mac-Server anhalten, Funnel offen, Sätze eintragen, Server wieder an“ auf dem iPhone.

## P1 (FT-ARCH-08 + FT-PERF-03, KB-09/KB-G): Freigabe unter Vorbehalt Doku

- `guarded-poll.ts:12-40`: höchstens ein Lauf gleichzeitig, Abbruch per `AbortController` nach 10 s, Guard wird auch bei ignoriertem Signal frei (`Promise.race`, `:30`), `clearTimeout` im `finally`. Tests `guarded-poll.test.ts` (5) grün.
- Race nach Timeout: der alte `loadWorkout` läuft ggf. weiter (z. B. hängende Bridge `getPendingOfflineWorkout`, `workout-detail.tsx:826`, nicht abbrechbar), aber der nächste Tick erhöht `loadRequestIdRef` (`:820`), alle Setzer prüfen `isStale()` → keine veraltete Überschreibung. Fetches erhalten das Signal (`:859, :901`); abgebrochener Poll lässt den Zustand stehen (`:955-956`). Hängende Bridge-Aufrufe stapeln sich höchstens alle 10 s statt jede Sekunde.
- `prisma.ts:20-25`: typ- und verhaltensgleich bis auf Leerlauf 60 s (siehe Tabelle 1e). Neon-Autosuspend (Standard 5 min) liegt darüber; serverseitig geschlossene Leerlaufverbindungen fängt `onIdleClientError` im Adapter ab.

**Forderung:** Eintrag in `project-docs/` (B-4). Gerätetest mit Watch (Sätze von der Uhr erscheinen weiter innerhalb ~1 s; bei langsamem Server kein Hängen).

## Nicht geprüft

- iPhone/WKWebView (Capacitor, `NativeAuthFetchPatch`, `resume`-Flush, vorhandene IndexedDB-Daten auf dem Gerät inkl. verwaister Queue-Zeilen), Apple Watch (WatchConnectivity-Pfad, Poll-Latenz), Swift nicht kompilierbar hier.
- Mac-Betrieb (launchd, Funnel/Tailscale-Verhalten bei Timeout/502/503, `selfhost.sh`), Last über Stunden.
- Echte Neon-DB (Leerlauf-Trennung, Kaltstart, Pooler) und echte Serverantworten bei Timeout; kein Netz gegen Produktion.
- Dexie-Transaktionen real (nur gemockter Store), Rekord-/PR-Semantik bei wiederholtem PATCH.
- Keine `.env`- oder DB-Inhalte gelesen.
