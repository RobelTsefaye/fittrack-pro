# 07 Fehlerbehandlung, Logging, KI-Nutzung, Secrets (FitTrack Pro), Präfix FT-ERR-

Stand 2026-11-12, nur gelesen (kein Code geändert, keine DB, kein Netzwerk, Swift nicht berührt). Geprüft: `src/lib/api/route-handler.ts`, alle 82 `route.ts` (Struktur, Fehlerpfade), Satz-Schreibpfad (`set-row.tsx`, `workout-detail.tsx`, `sets/*`), `src/app/api/chat`, `src/app/api/mcp/*`, `mcp/fittrack-mcp`, `src/features/ai/context.ts`, Auth-/Krypto-Libs, `.env.example`, `scripts/selfhost.sh`, Next-16-Doku (`error.md`, `instrumentation.md`) und `@auth/core` 0.41.0 (Secret-Verarbeitung). Keine Werte von Secrets gelesen.

Abgrenzung: Rate-Limit, Kostenmissbrauch, Prompt-Injection, Gesundheitsdaten im Log, `detail: e.message` in `/api/tokens`, Fallback-Secret und Token-Ablauf stehen bereits in `02-security.md` (FT-SEC-03/-09/-10/-17/-18/-14/-05); Offline-Queue-Fehler, fehlende fetch-Timeouts und verschluckter Offline-Abschluss in `01-architektur.md` (FT-ARCH-14/-15/-21). Hier nur Verweise und neue Befunde. Hinweis: Die Zeilenangaben in FT-SEC-02/-09 passen nicht mehr zum aktuellen Stand (z. B. `authorize/route.ts` hat 81 Zeilen, `chat/route.ts` 121); Befund selbst gilt weiter.

## Zusammenfassung

1. **Hoch (3):** Der Satz-Schreibpfad meldet Fehler nicht (`set-row.tsx`, `workout-detail.tsx`: Nicht-OK-Antworten und Netzfehler bleiben meist stumm, `void saveSet()` ohne Fänger), `PATCH /sets/[setId]` ist nicht atomar (Satz gespeichert, dann 500, Rekord gelöscht und nicht neu gesetzt), und es gibt **keine** `error.tsx`/`global-error.tsx`/`not-found.tsx` (Renderfehler im 2260-Zeilen-Workout-Screen = weiße Seite). Das erklärt einen Teil von KB-09/KB-11.
2. **Mittel (10):** 12 Routen ohne `withApi` liefern 500 ohne JSON (Login zeigt dann "ungültige Zugangsdaten"), `withApi` bildet keine Prisma-/Zod-Fehler ab und loggt nichts, kein Error-Tracking (`instrumentation.ts` fehlt), SSE meldet DB-Ausfall als "kein Training" (KB-10), MCP gibt rohe Fehlertexte zurück.
3. **KI:** Nur `/api/chat` ruft ein Modell (Gemini über AI SDK 6); der Endpunkt hat **keinen Aufrufer mehr** (UI nach Nexus verschoben), aber Key, Route und Kosten-Fläche bleiben. `/api/ai/*` und MCP rufen kein Modell auf, liefern aber den vollen Datensatz an Agenten, die der Nutzer selbst anbindet. `@ai-sdk/anthropic`/`@ai-sdk/react` sind ungenutzt.
4. **Secrets:** 6 Variablen mit Geheimnischarakter gelesen (`DATABASE_URL`, `DIRECT_DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_SECRET`, `GOOGLE_GENERATIVE_AI_API_KEY`, `FITTRACK_API_TOKEN`/`FITTRACK_TOKEN`). `AUTH_SECRET`-Rotation loggt alle Web-Nutzer aus, lässt aber alle `ftp_`-Tokens (Native-App, Watch, MCP) gültig (Hash ohne Secret): Rotation ist daher **kein** Widerruf. Auth.js unterstützt `AUTH_SECRET_1` für sanfte Rotation, `oauth-crypto.ts` nicht.
5. Positiv: `withApi`/`requireUserId`/`readJsonBody` sind in 70 von 82 Routen eingesetzt, Zod per `safeParse` (kein `.parse` in Routen, also kein ungefangener `ZodError`), Fehler-Tests für `withApi` vorhanden.

Anzahl: kritisch 0, hoch 3, mittel 10, niedrig 5 (gesamt 18).

## Findings

### Hoch

**FT-ERR-01** Satz-Schreibpfad: Fehler werden verschluckt (KB-09, KB-11)
- Fundstelle: `src/features/workouts/components/set-row.tsx:126-221` (`saveSet`: Netzfehler nur bei `complete` mit Toast, `:174-178`; Nicht-OK-Antwort nur `onRefresh?.()`, `:203-205`; `await res.json()` ohne Fänger `:182`; `deleteSet` `:208-221` ohne try und ohne Meldung; `void saveSet(...)` an `:240,253,259,265`), `workout-detail.tsx:1297-1303` (`addSet`: `if (!res.ok) return;`, `fetch` ohne try), `:1224-1241` (Übung hinzufügen: Antwort des Satz-POST wird ignoriert, `fetch` ohne try)
- Schweregrad: hoch
- Auswirkung: Schlägt ein Speichern von Gewicht/Reps per Stepper oder Eingabe fehl (401 nach gelöschtem Token, 500, Funnel/Mac weg, `navigator.onLine` lügt), erscheint nichts: `onRefresh` lädt den Serverstand und überschreibt die getippten Werte. Beim Abschluss eines Satzes mit 4xx/5xx passiert gar nichts (kein Toast, kein Rest-Timer, Häkchen springt zurück). Netzfehler in `deleteSet`/`addSet`/`saveSet` mit `await res.json()` werden zu unhandled Promise Rejections (wegen `void`). Der Nutzer glaubt, der Satz sei geloggt. Das passt zu "Daten gehen verloren"/"hängt" (KB-09/KB-11). Verwandt, aber nicht doppelt: FT-ARCH-14 (Offline-Abschluss), FT-ARCH-09 (Closures).
- Fix-Vorschlag: Einen gemeinsamen `saveSetRequest()` mit try/catch, Statusauswertung und Toast "Speichern fehlgeschlagen" (inkl. Wiederholen-Knopf) für alle Pfade; getippte Werte bei Fehler nicht per `onRefresh` überschreiben, sondern als "nicht gespeichert" markieren und erneut senden; bei 401 zur Anmeldung leiten; `void` durch `.catch(report)` ersetzen. Reihenfolge der Antworten (`saveSeqRef`) beibehalten.
- Aufwand: M
- Verhaltensrisiko: niedrig (zusätzliche Meldungen; Überschreiben-Verhalten ändert sich bewusst)

**FT-ERR-02** `PATCH /sets/[setId]` nicht atomar: Satz gespeichert, Antwort 500, Rekord verloren
- Fundstelle: `src/app/api/workouts/[id]/sets/[setId]/route.ts:56-90` (drei getrennte Schreibschritte: `set.update`, `workout.update`, `removePersonalRecordForSet` dann `recordPersonalRecordIfBest`), `:117-118` (DELETE: erst `deleteMany` Rekorde, dann `set.delete`)
- Schweregrad: hoch
- Auswirkung: Wirft Schritt 2 oder 3 (Verbindungsabbruch bei Neon/Selbsthosting, Zeitüberschreitung), ist der Satz bereits abgeschlossen gespeichert, der Client bekommt aber 500 (siehe FT-ERR-01: stumm), Rest-Timer-Reset und Rekordprüfung fehlen. Schlimmer: `removePersonalRecordForSet` löscht den Rekord, bevor `recordPersonalRecordIfBest` erneut entscheidet; bricht es dazwischen ab, ist der Rekord weg und wird nie neu berechnet (kein Retry, die nächste Änderung des Satzes müsste ihn zufällig auslösen). Beim DELETE entsteht bei Abbruch ein Satz ohne Rekord. Datenverlust-Klasse "Rekorde".
- Fix-Vorschlag: `prisma.$transaction` um Satz-Update, Timer-Reset und PR-Abgleich (PR-Funktionen mit `tx` als Parameter); DELETE ebenso. Alternativ PR-Abgleich idempotent machen (einzelner Neuberechnungsschritt `recomputeRecordsForExercise`) und nach Fehler nachholen.
- Aufwand: M
- Verhaltensrisiko: mittel (Rekord-Logik in `src/lib/personal-record.ts` muss `tx` akzeptieren; Characterization-Test `personal-record` vorhanden, vor Umbau erweitern)

**FT-ERR-03** Keine Fehlerseiten im App Router
- Fundstelle: `find src -name error.tsx -o -name not-found.tsx -o -name global-error.tsx` ergibt 0 Treffer (nur 8 `loading.tsx` unter `src/app/(app)/`); keine Error Boundary (`grep ErrorBoundary|componentDidCatch` leer)
- Schweregrad: hoch
- Auswirkung: Ein Renderfehler (z. B. `undefined.workoutExercises` in `workout-detail.tsx`, 2260 Zeilen, oder unerwartete API-Form nach Schemaänderung) reißt die gesamte Seite ohne Wiederherstellung ab (Next-Standardseite bzw. weißer Bildschirm); mitten im Training gibt es keinen "Erneut versuchen"-Knopf. In der Capacitor-Shell (statischer Export) ist das besonders hässlich: kein Browser-Zurück, App wirkt eingefroren (Nähe zu KB-09 "sieht kaputt aus"). Unbekannte URLs zeigen die Next-Standard-404 ohne App-Rahmen und ohne i18n.
- Fix-Vorschlag: `src/app/(app)/error.tsx` (Client Component, in Next 16 mit `unstable_retry` statt `reset`, siehe `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`), `src/app/global-error.tsx` (muss eigenes `<html>/<body>` rendern), `src/app/not-found.tsx`; Text über `useI18n` bzw. feste zweisprachige Texte (global-error hat keinen Provider); Fehler an Logger (FT-ERR-06) melden; Offline-Snapshot-Hinweis ("Deine Eingaben sind lokal gesichert") anzeigen, wenn Queue nicht leer. `error.tsx` zusätzlich um `workouts/[id]` legen, damit der Rest der Navigation bleibt. Für den Native-Export prüfen, ob `global-error` dort erlaubt ist (Vermutung: ja).
- Aufwand: S
- Verhaltensrisiko: keins

### Mittel

**FT-ERR-04** Routen ohne `withApi`: 500 ohne JSON, falsche Login-Meldung
- Fundstelle: 12 Routen ohne `withApi` (Skript-Zählung): `auth/native-login/route.ts:27-68`, `auth/register/route.ts:17-50`, `push-tokens/route.ts`, `chat/route.ts:89`, `mcp/route.ts:582-637`, `mcp/oauth/{authorize,register,token}/route.ts`, `health/route.ts`, `auth/[...nextauth]`, 2x `.well-known`. Client: `src/features/auth/components/login-form.tsx:75-79` (`res.ok ? await res.json() : null` → `invalidCredentials`), `register-form.tsx:48,79`
- Schweregrad: mittel
- Auswirkung: Fällt die DB aus oder wirft Prisma in `native-login`/`register`, antwortet Next mit 500 und leerem/HTML-Body. Die Login-Maske der nativen App wertet jeden Nicht-OK-Status als "E-Mail oder Passwort ungültig" (`login-form.tsx:75-79`): Serverausfall (KB-F/KB-G: Mac schläft, Vercel pausiert) sieht aus wie falsches Passwort, Nutzer ändern ggf. Passwörter oder suchen am falschen Ort. `register`: Prüfen-dann-Anlegen (`:27-45`) hat ein Zeitfenster; zwei parallele Anfragen → Prisma `P2002` → 500 statt 409.
- Fix-Vorschlag: `native-login`, `register`, `push-tokens`, `authorize`, `token` in `withApi` hüllen (Pfade ohne Session-Auth brauchen nur das Fehlerabbilden); `P2002` → 409; im Login-Formular 401/400 von 5xx/Netz unterscheiden ("Server nicht erreichbar, später erneut versuchen"). `mcp/route.ts` bekommt eigenes JSON-RPC-Fehlerumfeld (-32603), nicht `withApi`.
- Aufwand: S
- Verhaltensrisiko: niedrig (nur Fehlerantworten ändern sich)

**FT-ERR-05** `withApi` bildet nur `ApiError`/`InvalidDateError` ab, loggt nichts
- Fundstelle: `src/lib/api/route-handler.ts:36-42` (`toErrorResponse`), `:52-64` (`throw error` für alles andere)
- Schweregrad: mittel
- Auswirkung: Prisma-Fehler mit bekannten Codes (`P2025` Datensatz fehlt bei Race zwischen `findFirst` und `update`, z. B. Satz nach Löschen auf anderem Gerät bearbeiten; `P2002` Unique; `P2003` Fremdschlüssel, siehe FT-SEC-12) werden zu 500, obwohl 404/409 richtig wären; der Offline-Flush behandelt 404 als Erfolg, 500 aber als Abbruch (FT-ARCH-04/-15) und blockiert die Queue ohne Grund. `ZodError` (falls künftig `.parse` benutzt wird) ebenfalls 500. Rethrow ohne Kontext: Next loggt nur Stack mit Digest, ohne Route, Methode, `userId`, Dauer. Der Handler gibt bei 500 keinen JSON-Body (`{ error }`) zurück; Clients sind uneinheitlich (`res.json().catch(...)`).
- Fix-Vorschlag: `toErrorResponse` erweitern: `ZodError` → 400 mit `issues`, Prisma `P2025` → 404, `P2002` → 409, `P2003` → 400/404, sonst 500 mit `{ error: "Internal error", requestId }` und serverseitigem `logger.error({ route, method, userId, requestId, code }, err)`. Test in `src/lib/api/__tests__` ergänzen.
- Aufwand: S
- Verhaltensrisiko: niedrig (einige 500 werden 404/409; Offline-Flush behandelt 404 als Erfolg, vorher mit FT-ARCH-04 abstimmen, sonst stilles Verwerfen mehr statt weniger)

**FT-ERR-06** Kein Error-Tracking, kein strukturiertes Logging
- Fundstelle: kein `instrumentation.ts`/`instrumentation-client.ts` (`ls` leer; `onRequestError` in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md` dokumentiert); nur 2 `console.error` in API-Routen (`tokens/route.ts:34,79`), sonst `console.log` in `health-data/route.ts:531-600`; Selbsthosting loggt nach `~/Library/Logs/fittrack.log` (`scripts/selfhost.sh:22,60`)
- Schweregrad: mittel
- Auswirkung: Fehler in Produktion (Vercel pausiert, Mac als Host, KB-G) sind nur durch Nachlesen der Datei sichtbar, ohne Rotation, ohne Korrelations-ID, ohne Trennung von Nutzer-/Systemfehlern; Client-Fehler (unhandled rejections aus FT-ERR-01, Renderfehler) erreichen den Server nie. Für KB-09/KB-10/KB-11 gibt es keine Telemetrie, um "hängt/Absturz" zu belegen. Gesundheitsdaten im Klartext-Log: FT-SEC-17.
- Fix-Vorschlag: `src/instrumentation.ts` mit `onRequestError` (Pfad, Methode, Fehlerklasse, Digest) auf einen kleinen JSON-Logger (`level, ts, route, requestId, userId-Hash`, keine Request-Bodys, Authorization/Cookie/`token`-Query maskieren); optional `/api/client-errors` (Rate-limitiert) für `window.onerror`/`unhandledrejection` und `error.tsx`. Log-Rotation (`newsyslog`/`logrotate`-Äquivalent) in `selfhost.sh`.
- Aufwand: M
- Verhaltensrisiko: keins

**FT-ERR-07** SSE meldet DB-Ausfall als "kein Training" (KB-10)
- Fundstelle: `src/app/api/cardio/live/stream/route.ts:69-84` (`catch { /* Transient DB hiccup */ }` lässt `payload = null`), `:85-89` (null → `data: {"data":null}` an den Client)
- Schweregrad: mittel
- Auswirkung: Fällt die Abfrage aus (Neon-Cold-Start, Verbindungslimit durch viele 300-ms-Poller, FT-SEC-11), sendet der Server an die Cardio-Uhr/Live-Ansicht "kein laufendes Training" statt Fehler. Die Anzeige springt auf "gestoppt", obwohl das Training läuft; nach der nächsten erfolgreichen Abfrage wieder zurück (Flackern, "hängt"). Es wird nicht geloggt, wie oft das passiert.
- Fix-Vorschlag: Bei Fehler letzten Stand beibehalten und kein Ereignis senden (nur Heartbeat), optional `event: error`-Frame nach N Fehlern; Fehler zählen/loggen (FT-ERR-06).
- Aufwand: S
- Verhaltensrisiko: niedrig

**FT-ERR-08** `POST /sets`: Race bei `setNumber`, Warm-up-Verschiebung nicht transaktional
- Fundstelle: `src/app/api/workouts/[id]/exercises/[weId]/sets/route.ts:48-70` (`updateMany` increment, dann `create`), `:80-90` (`findFirst` letzte Nummer + 1, dann `create`); `prisma/schema.prisma` Modell `Set`: nur `@@index([workoutExerciseId])`, kein `@@unique([workoutExerciseId, setNumber])`
- Schweregrad: mittel
- Auswirkung: Zwei gleichzeitige Anlegen (Doppeltipp, Watch + Phone, Offline-Replay FT-ARCH-03) erzeugen zwei Sätze mit gleicher `setNumber`; die Sortierung ist dann zufällig. Bricht das Warm-up-Anlegen nach `updateMany` ab, sind alle Nummern um 1 verschoben und `setNumber 1` fehlt. Keine Fehlermeldung, nur "komische" Reihenfolge (KB-09 "sieht kaputt aus").
- Fix-Vorschlag: In `$transaction` mit `SELECT ... FOR UPDATE` auf `workout_exercises`-Zeile oder Unique-Index plus Retry bei `P2002`; Index erfordert vorher Bereinigung bestehender Dubletten (Prod-Daten nicht geprüft, Vermutung: einzelne Dubletten möglich). Schema/Migration nicht parallel zu anderen Änderungen (siehe CLAUDE.md-Regel).
- Aufwand: M
- Verhaltensrisiko: mittel (Unique-Index kann Migration auf Bestandsdaten blockieren)

**FT-ERR-09** MCP-Endpunkt: rohe Fehlertexte, falsche Fehlerklasse, keine Logs
- Fundstelle: `src/app/api/mcp/route.ts:545-551` (`rpcErr(id, -32603, e.message)`), `:508` (`Unknown tool` als -32603), `:288-` (`callTool`: Argumente ungeprüft, `String(args.x)`), `:582-592` (`resolveUserIdBySecret` ohne try: DB-Fehler → 500 ohne JSON-RPC), `:620-625` (Batch `Promise.all`, siehe FT-SEC-09)
- Schweregrad: mittel
- Auswirkung: Prisma-/Treiber-Fehlertexte (Tabellen, Spalten, SQL-Fragmente, Host-Teile) gehen an den MCP-Client und damit in den Kontext eines fremden LLM-Dienstes; Werkzeugfehler werden als Protokollfehler (-32603) statt als Ergebnis mit `isError: true` geliefert, so dass Clients nicht sinnvoll wiederholen oder dem Modell erklären können. Nichts davon wird serverseitig geloggt. Unbekanntes Tool müsste -32602 sein. Gleiches Leck-Muster: FT-SEC-18 (`/api/tokens`).
- Fix-Vorschlag: Werkzeugausführung in `try/catch` → `{ content:[{type:"text", text:"Fehler: <generische Meldung>"}], isError:true }`, Details nur serverseitig loggen; Argumente per Zod validieren (`weeks`, `limit`, `status`, IDs als UUID) mit -32602; Auth-Auflösung in try/catch → JSON-RPC-Fehler 503.
- Aufwand: S
- Verhaltensrisiko: niedrig (Claude-Connector sieht andere Fehlertexte)

**FT-ERR-10** `/api/chat` (einziger Modellaufruf): Robustheit und Abbruch
- Fundstelle: `src/app/api/chat/route.ts:103` (`await req.json()` ohne try, kein Zod; kaputtes JSON → 500), `:105-108` (Kontextaufbau ohne Fehlerbehandlung, ca. 15 DB-Abfragen je Nachricht, ungecacht), `:112-118` (`streamText` ohne `abortSignal`, ohne `onError`/`onAbort`, ohne `maxRetries`-Entscheidung), `:6` (`maxDuration = 10` "Vercel Hobby"), `:89-101` (Antwort als Plaintext, nicht JSON, uneinheitlich zu `withApi`)
- Schweregrad: mittel
- Auswirkung: Bricht der Client ab (Tab zu), läuft der Modellaufruf weiter und kostet Tokens, weil das Request-Signal nicht an `streamText` gereicht wird (AI SDK 6 bricht nur mit `abortSignal` ab; ohne `consumeStream` wird der Stream bei Trennung verworfen, der Upstream läuft ggf. weiter, Vermutung ohne Laufzeittest). Ein Anbieterfehler mitten im Stream erscheint beim Client als generischer Stream-Fehler ohne serverseitiges Log; bei Vercel Hobby wird nach 10 s hart gekappt (halbe Antwort), auf dem Mac gilt die Grenze nicht. `messages` ist unbegrenzt in Anzahl/Länge (Eingabe-Tokens, Kosten) und Struktur (Zod fehlt): siehe FT-SEC-09, hier nicht erneut bewertet. `maxOutputTokens: 512` ist gesetzt (gut); Nutzerlimit pro Zeit fehlt (FT-SEC-03/-09).
- Fix-Vorschlag: Falls der Endpunkt bleibt: Body per Zod (`messages` max. N, je max. M Zeichen/Teile), `abortSignal: req.signal` plus `AbortSignal.timeout(...)`, `onError` mit Logging, Kontextaufbau mit einmaligem Kurz-Cache (z. B. 60 s pro User), `withApi`-Hülle; Fehlertext als JSON `{ error }`. Sonst FT-ERR-11 (entfernen).
- Aufwand: S
- Verhaltensrisiko: niedrig

**FT-ERR-11** `/api/chat` hat keinen Aufrufer; ungenutzte KI-Abhängigkeiten
- Fundstelle: `grep` nach `api/chat`, `useChat`, `DefaultChatTransport`, `@ai-sdk/react` in `src/`, `public/`, `ios/`: 0 Treffer außerhalb der Route; `middleware.ts:30` leitet `/coach` auf `/workouts` um ("Pages that moved to Nexus"); `package.json:26-28,44` (`@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/react`, `ai`); `@ai-sdk/anthropic` nirgends importiert (`grep anthropic src` leer); `.env.example` behauptet "The in-app AI Coach (/coach) requires this"; i18n-Schlüssel `coach.*` in `src/messages/en.json:593`
- Schweregrad: mittel
- Auswirkung: Ein authentifizierbarer (und per offener Registrierung für jeden erreichbarer, FT-SEC-04) Endpunkt, der den Gemini-Key belastet und Trainingsdaten an Google schickt, wird von keinem eigenen Client benutzt. Reine Angriffsfläche und Kostenrisiko ohne Nutzen; `@ai-sdk/anthropic` und `@ai-sdk/react` vergrößern Installation und Audit-Fläche. Doku (`.env.example`, `project-docs/ai-api.md`, `deployment.md` "AI keys") ist veraltet.
- Fix-Vorschlag: Mit Robel klären (Verhalten!): Route, `GOOGLE_GENERATIVE_AI_API_KEY`, `@ai-sdk/*`, `ai`, `coach.*`-Schlüssel entfernen, Doku bereinigen; oder Route hinter `ENABLE_CHAT=1` stellen. Nicht ohne OK löschen.
- Aufwand: S
- Verhaltensrisiko: niedrig (kein bekannter Aufrufer; ältere installierte App-Builds könnten die Route noch rufen, Vermutung, nicht prüfbar)

**FT-ERR-12** Datenschutz: Datenfluss zu KI-Diensten ohne Hinweis, Free-Tier-Bedingungen offen
- Fundstelle: `src/app/api/chat/route.ts:8-87,112` (System-Prompt mit Name, Gewichtseinheit, Streak, Trainingsvolumen je Woche, Top-Übungen, Rekorde, aktive Workouts mit Übungsnamen, letztes Körpergewicht, Planname/-sessions), `src/features/ai/context.ts:74-77` (Anzeigename), `.env.example` ("Free tier")
- Schweregrad: mittel
- Auswirkung: Gesundheits-/Trainingsdaten (Art. 9 DSGVO-nah: Körpergewicht, Aktivität) gehen an Google, kein Einwilligungstext, kein Opt-out im Produkt, keine Löschpflicht-Dokumentation. Für die kostenlose Gemini-API gelten laut Anbieter andere Nutzungsbedingungen als für die bezahlte (Daten können zur Produktverbesserung genutzt werden): **Vermutung/prüfen**, Bedingungen nicht abgerufen (kein Netzwerk). Persönliches Portfolio-Projekt: Risiko begrenzt, aber bei offener Registrierung (FT-SEC-04) werden fremde Nutzerdaten verarbeitet. Datenfluss-Inventar unten.
- Fix-Vorschlag: Entscheidung mit FT-ERR-11 koppeln; bleibt der Chat: Einwilligungsdialog vor erster Nutzung, Name nicht senden (Platzhalter), bezahlte Stufe mit Datenverarbeitungsvertrag, Eintrag in Datenschutzerklärung. Für `/api/ai/*`/MCP: Hinweis in Settings, dass Daten an den vom Nutzer gewählten Agenten gehen.
- Aufwand: S (Doku/Dialog) bis M
- Verhaltensrisiko: niedrig

**FT-ERR-13** Client-Fehlerzustände: Muster `.catch(() => {})`/`null` ohne Fehleranzeige
- Fundstelle: 15 leere Fänger in `src/` (Skript-Zählung), u. a. `src/app/(app)/exercises/usage/page.tsx:19`, `settings/preferences/page.tsx:25`, `exercises/[id]/page-client.tsx:26`, `workouts/new/page.tsx:76`, `workouts/[id]/page-client.tsx:27,30`, `features/workouts/components/today-start.tsx:32`, `features/settings/components/calendar-settings-section.tsx:36`, `features/cardio/cardio-live-context.tsx:58`, `features/plans/components/plan-detail-view.tsx:646-681` (Optimistisches Update, bei Fehler nur `load()` ohne Toast), `workout-detail.tsx:920-935` (bei Nicht-OK und vorhandenem Snapshot `setError(null)`: 401/500 werden als "alles gut" angezeigt)
- Schweregrad: mittel
- Auswirkung: Hooks/Seiten kennen nur "lädt" und "Daten", keinen Fehlerzustand: ein Fehlschlag zeigt leere Listen/Standardwerte (z. B. Einstellungen zeigen Defaults, danach überschreibt Speichern ggf. Echtwerte; Vermutung, Einzelfall nicht geprüft). `workout-detail.tsx:920-935`: Serverfehler oder abgelaufener Token verstecken sich hinter dem lokalen Snapshot; die 1-s-Polling-Schleife (FT-ARCH-08) wiederholt das, Nutzer arbeitet auf veraltetem Stand, Schreibfehler siehe FT-ERR-01. Gut: `loadWorkout` unterscheidet echtes 404 (purge) vom Netzfehler.
- Fix-Vorschlag: Kleiner Hook `useApiResource(url)` mit `{status: loading|error|ok, error, retry}` und gemeinsamem Fehlerbanner; bei Snapshot-Fallback Banner "Offline-Stand, Server nicht erreichbar (HTTP x)"; 401 überall zentral behandeln (zu `/login` bzw. Token neu holen).
- Aufwand: M
- Verhaltensrisiko: niedrig

### Niedrig

**FT-ERR-14** Modell-ID als schwebender Alias, keine Konfiguration
- Fundstelle: `src/app/api/chat/route.ts:114` (`google("gemini-flash-latest")`, Kommentar: Alias, weil 2.0 abgekündigt), `:117` (`maxOutputTokens: 512` fest)
- Schweregrad: niedrig
- Auswirkung: Ein `-latest`-Alias wechselt ohne Änderung im Repo das Modell (Qualität, Antwortformat, Preis, Datenbedingungen, Kontextgröße); Fehler dadurch sind nicht reproduzierbar. Modell-ID, Token-Limit und Provider sind im Code statt in Konfiguration.
- Fix-Vorschlag: Feste Modell-ID in `AI_CHAT_MODEL` (Env oder `lib/constants`), im Betrieb prüfen/aktualisieren; Limits ebenfalls als Konstanten. (Kein Handlungsbedarf, falls FT-ERR-11 den Endpunkt entfernt.)
- Aufwand: S
- Verhaltensrisiko: niedrig

**FT-ERR-15** MCP-Brücke `mcp/fittrack-mcp`: kein Timeout, Token über beliebiges Schema, Serverbody an das Modell
- Fundstelle: `mcp/fittrack-mcp/src/index.ts:41-45` (`fetch` ohne `AbortSignal`), `:19-24` (stiller Fallback `http://localhost:3000`), `:41-45` (Bearer an jede Basis-URL, auch `http://` im LAN), `:55-60` (`text.slice(0, 2000)` des Serverfehlers geht als Werkzeugergebnis an das LLM), `mcp/fittrack-mcp/README.md:73-74` (Token im Klartext in `claude_desktop_config.json`)
- Schweregrad: niedrig
- Auswirkung: Hängt der Mac/Funnel (KB-F/KB-G), blockiert der Werkzeugaufruf bis zum System-Timeout; bei `http://`-Basis läuft das Token unverschlüsselt (LAN); Serverfehlertexte (HTML, Stack, FT-ERR-09) landen im Modellkontext. Positiv: Token wird nie geloggt, `console.error` auf stderr (stdout bleibt dem Protokoll vorbehalten), 401/404-Hinweise sind hilfreich; Zod-Schemas für Parameter vorhanden. Fehler in `fittrackGet` (Netz) wirft; das SDK macht daraus einen Werkzeugfehler (Vermutung, nicht ausgeführt).
- Fix-Vorschlag: `AbortSignal.timeout(15000)`, `https://` oder Loopback erzwingen (sonst Abbruch mit Hinweis), Fehlerbody nur Status + generischer Text, Netzfehler als `isError` mit klarer Meldung; README: Token in OS-Schlüsselbund/Env-Datei mit Rechten 600, Token pro Gerät benennen.
- Aufwand: S
- Verhaltensrisiko: niedrig

**FT-ERR-16** OAuth `authorize`: Token vor Austausch angelegt, ungültige `redirect_uri` → 500
- Fundstelle: `src/app/api/mcp/oauth/authorize/route.ts:43-53` (`prisma.apiToken.create` bei jedem Aufruf, vor dem Code-Austausch), `:64` (`new URL(redirectUri)` ohne try; nur `errorRedirect` fängt), `token/route.ts:30-35` (Code ohne Einmal-Verbrauch, 5 Minuten wiederverwendbar; Vollzugriff siehe FT-SEC-02)
- Schweregrad: niedrig
- Auswirkung: Jeder abgebrochene oder wiederholte Verbindungsversuch hinterlässt ein dauerhaft gültiges Token "Claude MCP (Datum)" in der Token-Liste (ohne Ablauf, FT-SEC-05), auch wenn der Austausch nie stattfand; ein Redirect auf einen Nicht-URL-Wert wirft eine unbehandelte Ausnahme (500). Redirect-/PKCE-/Consent-Lücken bleiben in FT-SEC-02.
- Fix-Vorschlag: Token erst im `token`-Endpunkt erzeugen (Code enthält nur `userId`+Ablauf), Code einmalig machen (Nonce in DB/Cache), `new URL` in try → 400.
- Aufwand: M
- Verhaltensrisiko: mittel (Connector-Flow ändert sich intern; Claude.ai-Verbindung neu testen)

**FT-ERR-17** Secrets: Vorrang und Rotation nicht dokumentiert
- Fundstelle: `src/lib/prisma.ts:9` (`DIRECT_DATABASE_URL` gewinnt vor `DATABASE_URL`), `src/lib/oauth-crypto.ts:3-6` (nur ein Schlüssel), `.env.example` (kein `AUTH_SECRET_1`, `AUTH_TRUST_HOST`, `NEXTAUTH_SECRET`; "/coach" veraltet), `project-docs/deployment.md:135-138` (Tabelle ohne Rotation), `scripts/selfhost.sh:32` (prüft nur `DATABASE_URL AUTH_SECRET AUTH_URL`)
- Schweregrad: niedrig
- Auswirkung: Wer das Neon-Passwort rotiert (FT-SEC-01, dringend) und nur `DATABASE_URL` ändert, läuft weiter mit dem alten `DIRECT_DATABASE_URL` (falls gesetzt) und bekommt erst nach der Sperrung des alten Passworts Fehler. Für `AUTH_SECRET` gibt es keine dokumentierte Rotationsanleitung (siehe Abschnitt "AUTH_SECRET"). `oauth-crypto.ts` kennt keinen Schlüsselwechsel (Codes leben nur 5 Minuten, daher geringe Wirkung).
- Fix-Vorschlag: Rotationsanleitung in `project-docs/deployment.md` (Tabelle unten übernehmen); `selfhost.sh` warnt, wenn `DIRECT_DATABASE_URL` und `DATABASE_URL` auf unterschiedliche Hosts/Passwörter zeigen (ohne Werte auszugeben); `.env.example` ergänzen.
- Aufwand: S
- Verhaltensrisiko: keins

**FT-ERR-18** `calendar/overrides`: Datenbankfehler werden als Erfolg beantwortet
- Fundstelle: `src/app/api/calendar/overrides/route.ts:39` (`delete(...).catch(() => {})` dann `{ data: null }`), `:51-63` (DELETE ebenso)
- Schweregrad: niedrig
- Auswirkung: Der Fänger soll nur "nicht vorhanden" (`P2025`) schlucken, schluckt aber jeden Fehler (Verbindungsabbruch, Rechte); die Antwort sagt "gelöscht", der Override bleibt bestehen, Kalender zeigt weiter die verschobene/übersprungene Einheit. Selten, aber derselbe Muster-Typ wie FT-ERR-01.
- Fix-Vorschlag: Nur `P2025` ignorieren (`deleteMany` statt `delete` ist einfacher), alles andere weiterwerfen.
- Aufwand: S
- Verhaltensrisiko: keins

## Datenfluss-Inventar: personenbezogene Daten an KI-Dienste

| Pfad | Empfänger | Daten | Auslöser | Bemerkung |
|---|---|---|---|---|
| `POST /api/chat` (`chat/route.ts`) | Google (Gemini-API, Schlüssel `GOOGLE_GENERATIVE_AI_API_KEY`) | Anzeigename, Einheit, Streak, Anzahl Workouts/Rekorde, letztes Körpergewicht, 8 Wochen Volumen/Sätze je Woche, Top-8-Übungen, 5 letzte Rekorde mit Gewichten, aktive Workouts (Namen/Übungen), Plan-Rotation mit Übungsnamen, plus die Chatnachrichten des Nutzers | Nutzer sendet eine Nachricht; derzeit kein Aufrufer (FT-ERR-11) | Free-Tier-Bedingungen offen (FT-ERR-12); keine Einwilligung |
| `GET /api/ai/*` (13 Routen, u. a. `health`, `body-measurements`, `calendar`, `cardio-history`, `workouts`) | Beliebiger vom Nutzer angebundener Agent (Bearer-Token) | Vollständige Trainings-, Körper-, Gesundheits- (Schlaf/Erholung/Kalorien, siehe `src/app/api/ai/health`), Kalender- und Einstellungsdaten | Nutzer ruft per eigenem Token ab | Kein Modellaufruf im Server; Weitergabe liegt beim Agenten |
| `POST /api/mcp` (`mcp/route.ts`) | Claude.ai/Claude Desktop (Remote-MCP) | Wie `/api/ai/*`, zusätzlich Workout- und Übungsdetails | Nutzer verbindet Connector (OAuth oder `?token=`, FT-SEC-06) | Rohe Fehlertexte gehen mit (FT-ERR-09) |
| `mcp/fittrack-mcp` (lokal, stdio) | Claude Desktop | Dasselbe über `/api/ai/*` | lokal konfiguriertes Token | Token im Klartext in der Desktop-Konfig (FT-ERR-15) |
| `/api/ai/recommendations`, `buildHeuristicRecommendations` | niemand (regelbasiert, `source: "heuristic"`) | – | – | kein externer Aufruf |

Kein Aufruf an Anthropic aus dem Server-Code (`@ai-sdk/anthropic` ungenutzt, `ANTHROPIC_API_KEY` wird nirgends gelesen). Kein Prompt-Caching/Kostenlimit pro Nutzer vorhanden; Rate-Limits fehlen insgesamt (FT-SEC-03).

## Secrets-Inventar (nur Variablennamen)

| Variable | Gelesen in | Dokumentiert | Rotation möglich? |
|---|---|---|---|
| `DATABASE_URL` | `src/lib/prisma.ts:9`, `prisma.config.ts:10`, `scripts/db-sync-on-build.mjs:17`, `import-workouts.mjs`, `seed-demo.ts`, `selfhost.sh:32` (Prüfung) | `.env.example`, `deployment.md:56,135`, `selfhost.sh:11` | Ja: Passwort bei Neon ändern, in Vercel und Mac-`.env` setzen, neu starten. Kein Zustand im Code. Dringend wegen FT-SEC-01 |
| `DIRECT_DATABASE_URL` | gleiche Stellen, hat **Vorrang** (`prisma.ts:9`, `prisma.config.ts:10`) | `.env.example`, `deployment.md:57,136` | Ja, aber gleichzeitig mit `DATABASE_URL` ändern (FT-ERR-17) |
| `AUTH_SECRET` | implizit durch NextAuth (`@auth/core` `lib/utils/env.js:28-37`, `next-auth/lib/env.js:22`), explizit `src/lib/oauth-crypto.ts:4` (AES-256-GCM-Schlüssel = `sha256(secret)`), `selfhost.sh:32` | `.env.example`, `deployment.md:58,137`, `selfhost.sh:11` | Ja, mit Folgen (nächster Abschnitt); sanfter Wechsel nur für NextAuth über `AUTH_SECRET_1`, nicht für `oauth-crypto` |
| `NEXTAUTH_SECRET` | Fallback in `oauth-crypto.ts:4` und in `next-auth/lib/env.js:22` | nicht dokumentiert | Wie `AUTH_SECRET`; Reihenfolge-Unterschiede zwischen NextAuth und `oauth-crypto` möglich (FT-SEC-14) |
| `AUTH_SECRET_1..3` | von Auth.js gelesen (nicht im Code) | nicht dokumentiert | Mechanismus für Rotation (neuer Schlüssel signiert, alter entschlüsselt weiter) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `chat/route.ts:95` (Prüfung) und implizit durch `@ai-sdk/google` | `.env.example`, `deployment.md` ("AI keys"), `selfhost.sh:13` | Ja: Key bei Google erneuern, Env ersetzen, neu starten; kein Zustand. Entfällt, wenn FT-ERR-11 umgesetzt wird |
| `FITTRACK_API_TOKEN`, `FITTRACK_TOKEN` | `mcp/fittrack-mcp/src/index.ts:11-12`, `scripts/demo-ai-fetch.mjs:12` | `mcp/fittrack-mcp/README.md:73-74`, `project-docs/ai-api.md:27,31` | Ja: neues Token in Settings erzeugen, altes widerrufen (kein Ablauf, FT-SEC-05) |
| `ftp_…`-Tokens (DB `api_tokens`, kein Env) | `api-auth.ts:6-37`, erzeugt in `tokens/route.ts`, `native-login/route.ts:48`, `oauth/authorize/route.ts:43` | `CLAUDE.md`, `ai-api.md` | Manuell (Löschen in Settings); jeder Native-Login und jede MCP-Verbindung erzeugt ein neues, nie ablaufendes Token (FT-ERR-16, FT-SEC-05) |
| Nicht geheim, aber konfigurationskritisch: `AUTH_URL`, `AUTH_TRUST_HOST`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_ORIGIN` (`src/lib/constants.ts:13`, Default fest auf die Mac-Adresse, KB-F/FT-ARCH-10), `FITTRACK_BASE_URL`/`FITTRACK_URL`, `NATIVE_BUILD` | | `.env.example`, `deployment.md`, `selfhost.sh:12` | `NEXT_PUBLIC_*` werden beim Build in das Bundle gebrannt (Rotation = Neubau, auch der nativen App) |

Nicht vorhanden/gelesen: `ANTHROPIC_API_KEY`, `VERCEL_*`-Tokens im Code, Push-Zertifikate im Repo (`*.pem` ignoriert, siehe 02-security).

### AUTH_SECRET: Verwendung und Folgen einer Rotation

Verwendung:
1. **Web-Sitzung (NextAuth v5 beta.30, JWT):** Cookie-Verschlüsselung/-Signatur, 90 Tage Laufzeit (`auth.config.ts`). `AUTH_SECRET` (und `AUTH_SECRET_1..3`) werden von `@auth/core` 0.41.0 zu einer Liste verarbeitet; neue Schlüssel (`_1..3`) stehen vorn (signieren/verschlüsseln), `AUTH_SECRET` bleibt zum Entschlüsseln.
2. **OAuth-Codes für MCP (`oauth-crypto.ts`):** AES-256-GCM, Schlüssel `sha256(AUTH_SECRET ?? NEXTAUTH_SECRET ?? "fallback-dev-secret")`, enthält den **Klartext des `ftp_`-Tokens** (`payload.s`), Laufzeit 5 Minuten. Kein Mehrschlüsselverfahren, keine Schlüssel-ID.
3. **API-Tokens (`ftp_…`) hängen nicht an `AUTH_SECRET`:** Speicherung als SHA-256 des Tokens ohne Secret (`api-token-crypto.ts`). Auch Native-Login-Tokens (Keychain der App) und Watch-Tokens sind betroffen davon nicht.

Folgen eines Wechsels von `AUTH_SECRET` (nur ersetzen):
- Alle Browser-Sitzungen werden ungültig (JWT nicht mehr entschlüsselbar), alle Nutzer müssen sich neu anmelden; laufende Sitzungen mit Cookie-Auth (Safari/PWA) verlieren den Zugang bis zum Login. Kein Datenverlust.
- Offene OAuth-Codes (höchstens 5 Minuten) werden ungültig: laufende Claude-Connector-Verbindungen müssen neu gestartet werden; bereits ausgestellte Access-Tokens bleiben gültig.
- **Native App (Capacitor), Watch, MCP/Claude Desktop, Skripte laufen weiter**, weil sie `ftp_`-Bearer verwenden. Eine Rotation von `AUTH_SECRET` widerruft daher **keine** kompromittierten API-Tokens; dafür müssen Tokens in der DB gelöscht werden.
- Selfhosting (`selfhost.sh`/Vercel): "Gleicher AUTH_SECRET wie bei Vercel = Anmeldungen bleiben gültig" (`selfhost.sh:13`); beim Wechsel müssen beide Umgebungen **gleichzeitig** umgestellt werden, sonst loggen sie sich gegenseitig aus.
- Vermeidung des Ausloggens: `AUTH_SECRET_1=<neu>` setzen und `AUTH_SECRET=<alt>` behalten (nach Ablauf der 90 Tage entfernen). `oauth-crypto.ts` würde dann weiter nur den alten Schlüssel nutzen (kein Problem, 5-Minuten-Codes). Dieser Weg ist **Vermutung** gestützt auf den Auth.js-Code in `node_modules`, nicht ausgeführt.
- Fehlt `AUTH_SECRET` komplett, bricht NextAuth ab, `oauth-crypto` nutzt aber `"fallback-dev-secret"` (FT-SEC-14).

## Geprüft und in Ordnung

- `withApi` + `requireUserId` + `readJsonBody` sind konsistent in 70 Routen; `readJsonBody` gibt 400 bei kaputtem JSON; Zod per `safeParse` (33 Treffer in Routen, `.parse(` in Routen/Services/Features: 0), also kein ungefangener `ZodError`.
- `AI SDK 6`: `convertToModelMessages` wird mit `await` benutzt (asynchron in v6), `toUIMessageStreamResponse()` verwendet, Fehlermeldung des Providers wird dabei standardmäßig nicht an den Client durchgereicht (Vermutung nach Doku, nicht ausgeführt). `maxOutputTokens` gesetzt.
- Der Offline-/Snapshot-Fallback in `workout-detail.tsx` unterscheidet echtes 404 (Server sagt "gelöscht") von Netzfehlern.
- `api-auth.ts:15-17`: `lastUsedAt`-Update bewusst fire-and-forget; akzeptabel.
- `use-screen-wake-lock.ts`, `rest-timer-activity.ts`, `pr-celebration.tsx`: leere Fänger bei reinen Komfortfunktionen, kein Handlungsbedarf.
- Keine Secret-Werte, Token oder Passwörter in `console.*` gefunden (nur Gesundheitsdaten, FT-SEC-17).

## Offen / nicht geprüft

- Laufzeitverhalten (Abbruch von `streamText`, Retry-Standard des AI SDK, tatsächliche Next-500-Antwort ohne Body) nur aus Code/Doku abgeleitet, nichts ausgeführt.
- Prod-DB: ob Dubletten in `sets.setNumber` existieren (FT-ERR-08) und wie viele verwaiste `Claude MCP`-Tokens (FT-ERR-16): ohne DB-Zugriff nicht prüfbar.
- Gemini-Free-Tier-Nutzungsbedingungen: nicht abgerufen (kein Netzwerk).
- Swift-Seite (`WatchAPIProxy.swift`, native Fehlerpfade, `NativeAuthTokenPlugin`): nicht gelesen, KB-J/KB-10.
- `src/app/api/health-data` HAE-Pfad und Rest der 70 `withApi`-Routen nur stichprobenartig auf Fehlerpfade gelesen.
