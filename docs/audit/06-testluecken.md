# 06 Testlücken FitTrack (Präfix FT-TEST-)

Stand: 2026-11-12. Nur gelesen, kein Code, keine Konfiguration, keine Datenbank geändert.

Ausgeführt:
- `npx vitest run`: 26 Dateien grün, 1 Datei übersprungen, 178 Tests grün, 6 `todo`.
- `npx --no-install vitest run --coverage`: nicht ausgeführt, weil `@vitest/coverage-v8` fehlt (`MISSING DEPENDENCY`). Nicht installiert, wie vorgegeben. Ohne Installation gibt es keine Coverage-Zahlen. Die Abdeckung unten ist deshalb Dateiebene per Import-Textsuche.

## Zusammenfassung
1. Die 178 Tests sind grün, decken aber fast nur Logik ab. Von 32 Routen-Dateien mit schreibenden Methoden (POST/PUT/PATCH/DELETE) hat genau eine einen Verhaltenstest (`health-data/__tests__/route.test.ts`). Die übrigen prüft nur ein Textscan auf Auth-Muster (FT-TEST-01).
2. Mandantentrennung ist nicht verhaltensgetestet. Stichproben (`nutrition-plan/[id]`, `plan-session-exercises/[pseId]`, `plans/[planId]`) sind korrekt abgesichert, aber kein Test beweist, dass fremde IDs 404 liefern (FT-TEST-02).
3. Der OAuth-Authorize-Endpunkt ist ungetestet. Der Auth-Scan stuft ihn als „authentifiziert“ ein und sieht `redirect_uri` nicht. Das Modul prüft nur das Vorhandensein (`authorize/route.ts:19-27`), und XR-SEC-01 (10-api-vertrag) beschreibt die offene Stelle (FT-TEST-03).
4. Offline-Sync (KB-11, „Daten gehen verloren“) hat Tests für die Flush-Logik. Dexie mit 17 Schema-Versionen, die Offline-Stores und die Migrationen sind ungetestet, und dafür fehlt `fake-indexeddb` (FT-TEST-04).
5. Gesamt: 0 kritisch, 4 hoch, 8 mittel, 2 niedrig. CI ist vorhanden (lint, typecheck, test, build), aber sie läuft nur bei Push auf `main` und bei PRs. Playwright und MCP-Tests fehlen.

## Ist-Stand Testabdeckung

| Bereich | Module gesamt | ohne Testimport | Kommentar |
|---|---|---|---|
| `src/lib` + `src/services` + `src/features` | 122 | 77 | Getestet: Schemas, Workout-Logik, Gewichtstrend, Ernährungsplan, Streaks, PR, Zeitformat, Auth-Helfer, OAuth-Crypto, Offline-Flush (2 Dateien), Watch-Payload |
| API-Routen (`src/app/api`) | 80 `route.ts` | 79 ohne Verhaltenstest | Auth-Textscan für alle (`route-auth-coverage`), Verhalten nur `health-data` (GET/POST/DELETE) und `withApi` |
| Schreibende Routen | 32 Dateien | 31 | Workouts, Sätze, Übungen, Pläne, Sessions, Körper, Export, Tokens, Push-Tokens, Settings |
| UI (`components/`, `features/**/components`) | 65 `.tsx` | alle | Vitest: `environment: node`, `include: src/**/*.test.ts` (keine `.tsx`). Kein jsdom, kein Testing Library |

## Findings (nach Schweregrad)

| ID | Fundstelle | Schwere | Auswirkung | Fix-Vorschlag | Aufwand | Verhaltensrisiko |
|---|---|---|---|---|---|---|
| FT-TEST-01 | 32 Routen-Dateien mit `export const POST/PUT/PATCH/DELETE` in `src/app/api` (u. a. `workouts/[id]/sets/[setId]/route.ts`, `workouts/[id]/complete/route.ts`, `body-weight/route.ts`, `plans/…`, `export/route.ts`, `tokens/route.ts`); einziger Verhaltenstest `src/app/api/health-data/__tests__/route.test.ts`; Auth-Scan `src/app/api/__tests__/route-auth-coverage.test.ts` | hoch | Das Training (täglich genutzt, „darf nie kaputtgehen“) und die Körperdaten (Datenverlust-Liste) laufen über Routen, die kein Test anspricht. Ein Fehler in Validierung, Upsert oder `revalidateTag` fällt erst im Alltag auf. Der Auth-Scan erkennt nur, dass ein Auth-Aufruf im Quelltext steht, nicht ob er vor dem Schreiben greift (so der eigene Kommentar im Test). | Test-Harness nach dem Muster von `health-data/__tests__/route.test.ts` (Prisma und Auth gemockt, `Request` direkt an den Handler) als gemeinsame Hilfsfunktion. Erst die Routen mit Datenverlust-Potenzial: `workouts/[id]/sets`, `body-weight` (POST/DELETE), `plans`, `export`, `tokens`. Je Route: Erfolgsfall, 400 bei ungültigem Body, 401 ohne Sitzung, Antwortform. | M (Harness S, je Route S) | keins |
| FT-TEST-02 | Abfragen per `where: { id … }` in 51 Routen-Stellen. Geprüft und abgesichert: `nutrition-plan/[id]/route.ts:51-58` (vorher `findUnique` mit Vergleich auf `userId`), `plan-session-exercises/[pseId]/route.ts` (`getPseForUser`), `plans/[planId]/route.ts:44-58` (`findFirst` mit `userId`). Ungetestet bleibt, ob das für alle 51 gilt. | hoch | Kein Test beweist Mandantentrennung. Eine künftige Änderung (neue Route, Refactoring von `getPseForUser` oder `findUnique` ohne Vergleich) kann Daten eines anderen Kontos freigeben, ohne dass ein Test rot wird. Die Stichprobe ist sauber, aber nicht belegt für alle Routen. | Tabellengetriebener Test: für jede Route mit `[id]`-Segment ein zweiter Nutzer, Anfrage mit fremder ID, erwartet 404 und keine Änderung in der Datenbank (Mock prüft: kein `update`/`delete` aufgerufen). Einstieg: die 51 Stellen aus `grep -rn "where: { id"`. | M | keins |
| FT-TEST-03 | `src/app/api/mcp/oauth/authorize/route.ts:15-27` (`redirect_uri` nur auf Vorhandensein geprüft, keine Allowlist im Modul); `src/app/api/mcp/oauth/token/route.ts`; `route-auth-coverage.test.ts` (Authorize steht weder in ALLOWLIST noch in UNKLAR) | hoch | Der Textscan sieht den Auth-Aufruf und meldet „ok“. Die Schwachstelle liegt in der Logik (`redirect_uri`, PKCE optional, GET erzeugt Token). Laut `docs/audit/10-api-vertrag-betrieb.md` (XR-SEC-01/02) ist das offen. Ohne Verhaltenstest meldet die Suite grün, obwohl der Endpunkt Tokens an fremde Adressen ausgeben kann. | Verhaltenstest mit `it.fails` (Vitest-Muster: Test ist grün, solange der Fehler existiert, und wird rot, sobald er behoben ist, dann auf `it` umstellen): `redirect_uri=https://fremd.example/` muss 400 liefern. Zusätzlich Tests für PKCE-Pflicht und einmalige Codes, sobald der Fix kommt. | S | keins |
| FT-TEST-04 | `src/lib/offline/db.ts` (343 Z., Dexie, 17 Schema-Versionen, `version(1)` bis `version(17)`; Kommentar Z. 174-175 zu einem übersprungenen `version(2)`); ungetestet außerdem `flush-all-queues.ts` (24), `screen-caches.ts` (234), `plan-session-offline.ts` (88), `body-weight-offline-store.ts`, `workout-offline-store.ts`; Quelle KB-11 („Daten gehen verloren“, blockiert Robel) | hoch | Ein Schema-Upgrade oder ein Fehler im Store kann lokal ungesicherte Trainings- oder Gewichtsdaten beim Upgrade verwerfen. Die Flush-Logik hat Tests (10 + 5 aktive Fälle, je 1 `todo`), die Speicherseite nicht. Das Verhalten beim Upgrade von älteren Versionen (z. B. v10 → v17) ist unbelegt. | `fake-indexeddb` als devDependency (neue Abhängigkeit, Robel-Freigabe nötig). Dann Migrationstest: Datenbank mit Daten im Schema v1/v11 anlegen, auf aktuell heben, Zeilen zählen und Inhalte vergleichen. Zusätzlich Test für `flushAllQueues` (Reihenfolge Workouts → Gewicht, Fehler eines Blocks blockiert den anderen nicht). | M-L | keins (Test); mittel (Schema-Änderungen selbst) |
| FT-TEST-05 | `src/features/health/recovery.ts` (762 Z.; XR-API-03: „score 0, level none“ wird als Wert ausgeliefert), `src/features/ai/context.ts` (508; speist Nexus über `coach-context`), `src/features/dashboard/training-insights.ts` (258), `src/features/health/cardio.ts` (281), `src/services/personal-records.ts` (118), `src/services/muscle-heatmap.ts` (63), `src/features/workouts/workouts-list-data.ts` (108), `workout-detail-data.ts` (70), `src/features/ai/week-stats.ts` (57) | mittel | Berechnungen für Erholung, Trainingsanalyse und KI-Kontext sind nicht getestet. `context.ts` ist der Vertrag zu Nexus (`fetchFittrack('coach-context')`, `training-summary`): eine Feldänderung trifft Nexus ohne Warnung. Erholung „level none“ zeigt Nexus als „0“ (XR-API-03). | Eingefrorene Fixtures aus den realen Eingaben (keine Live-Daten), Tests für: Erholung ohne Daten (`null`, nicht 0), Schema des `coach-context`-Objekts (Felder, die Nexus liest), Service-Tests für PR und Heatmap mit leeren und mehrsprachigen Übungsnamen. | M je Modul | keins |
| FT-TEST-06 | `src/lib/offline/__tests__/flush-body-weight-queue.test.ts:81-85` (`it.todo` für KB-11: „Prozessende nach POST vor Entfernen dupliziert Einträge - braucht echte IndexedDB“) | mittel | Die Begründung im `todo` stimmt nur zum Teil. Der POST-Pfad ist ein Upsert auf `(userId, date)` (`src/app/api/body-weight/route.ts:58-75`), ein Replay nach einem Absturz erzeugt also keine zweite Zeile. Das Restrisiko liegt bei PATCH/DELETE, die nach späteren Operationen erneut laufen. Der Test braucht keine echte IndexedDB, weil der Store gemockt ist (wie in den übrigen Flush-Tests). | `todo` durch zwei aktive Tests ersetzen: (a) `removeBodyWeightQueueEntries` wirft einmal beim Entfernen, zweiter Flush sendet POST erneut, Route-Mock zeigt genau eine Zeile (Upsert); (b) PATCH/DELETE-Reihenfolge nach POST desselben Datums. | S | keins |
| FT-TEST-07 | `src/components/offline-sync-provider.tsx`, `src/components/layout/active-workout-banner.tsx`; `flush-workout-queue.test.ts:180-184` (`it.todo`: Statusanzeige „synchronisiert“ bei verworfener Queue) | mittel | KB-11-Statusanzeige ist falsch, aber der Zustand steckt in einer Komponente. Ohne jsdom oder Testing Library ist das nicht testbar. | Zustandslogik in eine reine Funktion auslagern (z. B. `sync-status.ts`: Eingabe Queue-Länge, Ergebnis, Online-Status; Ausgabe Anzeigezustand) und testen. Komponente bleibt dünn. Alternativ Playwright (FT-TEST-10). | S-M | niedrig (Auslagern) |
| FT-TEST-08 | `vitest.config.mts:6-7` (`include: ["src/**/*.test.ts"]`, `environment: "node"`); `@vitest/coverage-v8` nicht installiert (Coverage-Lauf schlägt fehl) | mittel | Coverage kann nicht gemessen werden, deshalb gibt es keine Schwelle für kritische Pfade. `.test.tsx` wird nicht gefunden: Komponententests lassen sich nicht ohne Konfigurationsänderung ergänzen. | `@vitest/coverage-v8` als devDependency (Freigabe nötig), Schwellen nur für `src/lib/offline`, `src/app/api` (als Start 0 %, dann nach oben). `include` um `src/**/*.test.tsx` erweitern, Umgebung per Datei (`// @vitest-environment jsdom`), sobald jsdom da ist. | S | keins |
| FT-TEST-09 | `.github/workflows/ci.yml:6-9` (`push` nur auf `main`, `pull_request`); Schritte `lint`, `typecheck`, `test`, `build` | mittel | Pushes auf andere Branches ohne offenen PR laufen nicht. Der Audit-Branch (`refactor/audit-2026-11`) wird also nur über einen PR geprüft. Fehlend: Build des MCP-Pakets (`mcp/fittrack-mcp`, `tsc`, im CI nicht enthalten), Schema-Prüfung (`prisma validate`), Coverage-Bericht, Abhängigkeits-Audit. | Trigger auf `push` für alle Branches erweitern (oder `refactor/**`). Zusätzliche Schritte: `npx prisma validate`, `npm --prefix mcp/fittrack-mcp ci && npm --prefix mcp/fittrack-mcp run build`, Coverage erst nach FT-TEST-08. Vorschlag unten. | S | keins |
| FT-TEST-10 | Keine Playwright-Installation (`node_modules` ohne `playwright`, `package.json` ohne E2E-Skript) | mittel | Keine End-to-End-Prüfung. Die Lücken Login, Workout-Logging (KB-09) und Offline-Verhalten (KB-11) sind nur über Unit-Tests abgedeckt. | Vorschlag: `@playwright/test` (devDependency, Freigabe nötig), `e2e/smoke.spec.ts`. Stufe 1 ohne Datenbank: `/login` lädt, `/workouts` ohne Sitzung leitet um, `GET /api/workouts` ohne Sitzung 401. Stufe 2 mit Postgres-Dienst in CI, `prisma migrate deploy` und Testnutzer-Seed: Satz anlegen, abschließen, in der Liste sehen, Offline-Modus im Browser simulieren (`context.setOffline`). | M (Stufe 1), L (Stufe 2) | keins |
| FT-TEST-11 | `known-bugs-repro.test.ts:10-16` (KB-09, KB-10 als `it.todo`) | mittel | Beide Fehler sind „blockiert mich“, aber nicht reproduziert (Reproduktion „n. e.“ in KNOWN-BUGS). KB-09 braucht einen Browser mit Profiling (Vermutung `workout-detail.tsx`, 2259 Z.). KB-10 liegt im nie kompilierten Swift-Code (KB-J) und lässt sich hier nicht testen; serverseitig ist nur der SSE-Stream `cardio/live/stream/route.ts` prüfbar. | Erst Reproduktion mit Robel klären (Gerät, Schritte, Dauer). Dann KB-09 per Playwright-Trace (FT-TEST-10) mit Zeitbudget (z. B. „Satz hinzufügen unter X ms bei 200 Sätzen“). KB-10: SSE-Lebenszyklus-Test für `cardio/live/stream` (S-M), Swift bleibt manuell. | L (KB-09), M (KB-10 Server-Teil) | keins |
| FT-TEST-12 | `health-data/__tests__/route.test.ts:132-134` (`it.todo` KB-I: Tagesaktivkalorien werden überschrieben) | mittel | Die Route speichert nur das Tagesaggregat. Der Test prüft bereits den Upsert (`update.steps`), belegt aber nicht das Verhalten bei sinkenden Werten. Ob ein Wert überschrieben werden darf, ist eine Designfrage (Aggregat pro Quelle, oder Maximum, oder letzter Stand). Die Lösung ändert das Prisma-Schema, und das darf nicht parallel zu anderen Schema-Änderungen laufen (CLAUDE.md-Regel). | Charakterisierungstest jetzt: zweiter Sync mit niedrigerem Wert setzt den Wert tatsächlich zurück (dokumentiert das Ist-Verhalten). Die Entscheidung über das Zielverhalten holt man bei Robel ein, danach wird der Test umgedreht. | S (Test), L (Schema-Fix, Robel) | niedrig (Test); mittel (Fix) |
| FT-TEST-13 | `src/app/api/__tests__/route-auth-coverage.test.ts:169` (`it.todo("UNKLAR ist leer …")`) | niedrig | Die Bedingung ist eine Konstante: `UNKLAR` ist leer, das lässt sich sofort prüfen. Der `todo` zählt heute als offen, obwohl er nichts Offenes beschreibt. | `expect(Object.keys(UNKLAR)).toEqual([])` als aktiven Test. Aufwand Minuten, keine Risiken. | S | keins |
| FT-TEST-14 | `mcp/fittrack-mcp/package.json` (keine `test`-Skripte, keine Tests, nur `build` mit `tsc`); nicht in CI; `README.md` beschreibt die Werkzeuge | niedrig | Das MCP-Paket (Schnittstelle zu Claude Desktop, Token-Nutzung) hat keine Prüfung. Eine Änderung an Werkzeugnamen oder -Parametern fällt nur in Claude auf. | Smoke-Test über stdio: `node dist/index.js` starten, `tools/list` senden, Namen und Pflichtparameter vergleichen. Im CI: `npm --prefix mcp/fittrack-mcp run build`. Test selbst optional, weil neue Abhängigkeiten nötig wären. | S | keins |

## Die 6 `todo`-Tests und was zur Aktivierung nötig wäre

| Test | Datei | Aktivierbar? | Was nötig wäre |
|---|---|---|---|
| KB-09 Workout-Logging hängt | `known-bugs-repro.test.ts` | Nein, in dieser Umgebung | Reproduktion von Robel; Browser-Profiling (Playwright) |
| KB-10 Cardio-Uhr hängt | `known-bugs-repro.test.ts` | Nein (Swift) | Gerät/Watch-Code, nur der Server-SSE-Teil ist testbar |
| KB-11 Entfernung nach Schleife | `flush-body-weight-queue.test.ts` | Ja, mit Mock (FT-TEST-06) | Nur Umformulierung: Upsert macht Replay unschädlich; Test prüft Replay mit Mock |
| KB-11 Statusanzeige | `flush-workout-queue.test.ts` | Teilweise | Logik auslagern (FT-TEST-07) oder Playwright (FT-TEST-10) |
| KB-I Kalorien überschrieben | `health-data/route.test.ts` | Als Charakterisierungstest ja | Zielverhalten ist eine Entscheidung von Robel (FT-TEST-12) |
| UNKLAR leer | `route-auth-coverage.test.ts` | Ja, sofort | Eine Zeile (FT-TEST-13) |

## Vorschlag CI-Workflow (Ergänzung, nicht angelegt)

Änderungen an `.github/workflows/ci.yml`: Trigger auf alle Pushes, MCP-Build und Schema-Prüfung ergänzen. Bestehende Schritte bleiben unverändert.

```yaml
on:
  push:
  pull_request:
# ... Job "check" wie bisher, danach zusätzlich:
      - run: npx prisma validate
      - run: npm --prefix mcp/fittrack-mcp ci
      - run: npm --prefix mcp/fittrack-mcp run build
```

Hinweis: `npx prisma validate` braucht nur das Schema, keine Datenbank. Der MCP-Build braucht keine Secrets. Die Coverage-Schritte kommen erst, wenn FT-TEST-08 umgesetzt ist.

## Vergleich mit Nexus (CI)
- Nexus hat keine CI (kein `.github/`). Die Tests laufen nur lokal (`npm test`). Der Vorschlag steht in `/home/user/own-game/docs/audit/06-testluecken.md` (NX-TEST-06).
- FitTrack hat CI mit Lint, Typecheck, Tests und Build. Lücken siehe FT-TEST-09.

## Empfohlene Reihenfolge
1. FT-TEST-13 und FT-TEST-06 (Minuten bis Stunden, keine neuen Abhängigkeiten).
2. FT-TEST-02 und FT-TEST-03 (Mandanten- und OAuth-Verhalten; FT-TEST-03 als `it.fails`, damit die Lücke sichtbar bleibt).
3. FT-TEST-01 mit Harness für Training und Körper.
4. FT-TEST-04 nach Robels Freigabe für `fake-indexeddb` (Datenverlust-Pfad).
5. FT-TEST-09 (CI-Trigger), dann FT-TEST-10 (Playwright-Stufe 1).

Die Fixes selbst (z. B. `redirect_uri`-Allowlist, Schema-Änderung zu KB-I) gehören in eigene Branches `refactor/<ID>` gemäß CLAUDE.md. Schema- und Migrationsänderungen nie parallel.
