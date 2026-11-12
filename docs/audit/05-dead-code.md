# 05 Dead Code und Duplikate (FitTrack)

Stand 2026-11-12, Branch `refactor/audit-2026-11`. Nur Lesen: kein Code geändert, nichts gelöscht, keine Tests oder Builds ausgeführt, nichts aus `.env`, `data/` oder Datenbanken gelesen.

## Zusammenfassung

1. 14 Findings: 0 kritisch, 0 hoch, 6 mittel, 8 niedrig. Präfix `FT-DEAD-`. Werkzeuge (`knip`, `madge`, `ts-prune`) sind nicht installiert und wurden nicht ausgeführt; geprüft wurde mit eigenen Import- und Aufrufer-Skripten (Erreichbarkeit ab Next-Einstiegspunkten).
2. Größter Block: 17 API-Route-Dateien (656 Zeilen) ohne Aufrufer in FitTrack, Nexus, iOS und MCP, dazu die Ernährungs- und Gewichtsplan-Kette (ca. 800 Zeilen plus Tests). Entfernen nur mit Robels OK (FT-DEAD-01, -03).
3. Verdacht mit Funktionsverlust: Die Recovery-Widget-Daten werden nie vom Web-Teil geschrieben, weil die JS-Brücke `shared-data.ts` nirgends aufgerufen wird (FT-DEAD-06). Auf dem Gerät prüfen.
4. Offline: Die Körpergewicht-Warteschlange hat keinen Schreibpfad, läuft aber bei jedem Sync mit. Sechs Screen-Caches samt Dexie-Tabellen werden nie gelesen oder geschrieben (FT-DEAD-04, -05).
5. Hygiene (bestehende Befunde FT-ARCH-26, FT-SEC-01 verweisen darauf): Prototyp `Fitapp/` mit Kopien von Konfigurationsdateien, Planungsdateien im Root, einmaliges Import-Skript mit persönlichen Angaben, getrackte lokale Dateien. Keine Änderung vorgenommen.

## Methode und Grenzen

- Importgraph: alle `.ts`/`.tsx`/`.mjs` in `src/`, `mcp/`, `scripts/`, `prisma/` (relative Importe und `@/`-Alias). Erreichbarkeit ab Einstiegspunkten (Pages, Layouts, Live-Routen, Middleware, Konfigurationen, Tests, Skripte, MCP-Server), ohne die 17 Kandidaten aus FT-DEAD-01.
- Export-Check: jeder `export`-Name in `src/` gegen Namensvorkommen in anderen Dateien. Treffer einzeln nachgeprüft; Fehlalarme sind unten vermerkt.
- Routen-Check: jeder `route.ts`-Pfad gegen Aufrufe in `src/`, `mcp/`, `ios/App/` (Swift, Interpolation tolerant) und in den Nexus-Code (`/home/user/own-game`: `server.js`, `mobile.js`, `public/js`, Skripte). Dokumentation (`project-docs/`, `docs/audit/`) zählt nicht als Aufrufer.
- Swift: 59 Dateien unter `ios/App/`. Die Xcode-Projektdatei nutzt synchronisierte Ordner (`PBXFileSystemSynchronizedRootGroup`), nur `Info.plist` ist ausgenommen. Dateien, die nicht in der `project.pbxproj` stehen, sind also im Target enthalten (kein Befund). Typ- und Funktionsnamen mit nur einem Vorkommen: nur Systemeinstiegspunkte (`@main`, `AppShortcutsProvider`, Delegate-Methoden).
- Abhängigkeiten: nicht neu bewertet; Verweis auf FT-DEP-12 und FT-DEP-13 in `docs/audit/03-dependencies.md`.
- Bestehende Befunde werden referenziert statt wiederholt.

## Findings

| ID | Schweregrad | Titel | Aufwand | Verhaltensrisiko |
|---|---|---|---|---|
| FT-DEAD-01 | mittel | 17 API-Routen ohne Aufrufer | M | mittel |
| FT-DEAD-02 | mittel | Chat-Route und ihre KI-SDK-Kette ohne Oberfläche | S | niedrig-mittel |
| FT-DEAD-03 | mittel | Ernährungs- und Gewichtsplan-Kette ohne Oberfläche | M | mittel |
| FT-DEAD-04 | mittel | Sechs Screen-Caches und Dexie-Tabellen ohne Lese- oder Schreibpfad | M | mittel |
| FT-DEAD-05 | mittel | Körpergewicht-Warteschlange ohne Produzent | S-M | mittel |
| FT-DEAD-06 | mittel | Recovery-Widget-Brücke ohne Aufrufer (Verdacht) | S | mittel |
| FT-DEAD-07 | niedrig | Tote Exporte und Funktionen | S | keins |
| FT-DEAD-08 | niedrig | Vier ungenutzte shadcn-Komponenten | S | keins |
| FT-DEAD-09 | niedrig | `src/lib/types.ts`: nur globale Typ-Erweiterung wirksam | S | mittel (Typen) |
| FT-DEAD-10 | niedrig | `Fitapp/` (Prototyp) und Konfigurationskopien | S | keins |
| FT-DEAD-11 | niedrig | Planungsdokumente und veraltete Plugin-Notiz im Root | S | keins |
| FT-DEAD-12 | niedrig | `scripts/import-workouts.mjs`: einmaliges Skript mit persönlichen Angaben | S | keins |
| FT-DEAD-13 | niedrig | Lokale und IDE-Dateien im Repo | S | keins |
| FT-DEAD-14 | niedrig | Duplikate, die nicht in FT-ARCH-24 stehen | S | niedrig |

### Details

**FT-DEAD-01 (mittel): 17 API-Routen ohne Aufrufer**
- Fundstelle (je `route.ts` unter `src/app/api/`): `chat`, `body-measurements`, `records`, `health/cardio`, `health/cardio/[id]`, `nutrition-plan`, `nutrition-plan/[id]`, `nutrition-plan/current-target`, `nutrition-plan/weight-trend`, `nutrition-plan/weight-trend/calendar-weeks`, `dashboard/body-weight-trend`, `dashboard/consistency`, `dashboard/muscle-heatmap`, `dashboard/progress/[exerciseId]`, `dashboard/prs`, `dashboard/summary`, `dashboard/volume`. Umfang: 656 Zeilen Routen-Code.
- Belege: Routen-Check ohne Treffer in `src/`, `mcp/`, `ios/App/` und im Nexus-Code. Nexus ruft von FitTrack nur `/api/body-weight` und `/api/ai/*` auf (Nexus `server.js:189`, `:275-296`; `public/js/data.js:35-48`). MCP ruft nur `/api/ai/*` auf (`mcp/fittrack-mcp/src/index.ts`). `/api/dashboard/client-payload` und `/api/health/recovery` bleiben, sie werden von iOS gebraucht.
- Auswirkung: Ungenutzte Angriffsfläche, die in `docs/audit/02-security.md` trotzdem geprüft wird. Der Auth-Test `src/app/api/__tests__/route-auth-coverage.test.ts` listet alle Routen und muss angepasst werden. Externe Clients, die diese Pfade nutzen, sind nicht auszuschließen; die Liste mit Robel abgleichen.
- Fix: Mit Robel bestätigen. Dann in Blöcken entfernen (zuerst `dashboard/*` und `nutrition-plan/*`, dann `chat` nach FT-DEAD-02), Auth-Test und `docs/audit/02-security.md`-Tabelle mitziehen.
- Aufwand: M. Verhaltensrisiko: mittel (unbekannte externe Aufrufer).

**FT-DEAD-02 (mittel): Chat-Route und ihre KI-SDK-Kette ohne Oberfläche**
- Fundstelle: `src/app/api/chat/route.ts` (importiert `@ai-sdk/google`, `ai`); `.env.example` (`GOOGLE_GENERATIVE_AI_API_KEY`, nur von dieser Route gelesen). Keine Komponente nutzt `useChat` (`@ai-sdk/react` wird nirgends importiert).
- Belege: `grep` nach `api/chat` in `src/`, `ios/App/`, `mcp/`, Nexus: kein Treffer. `ai` und `@ai-sdk/google` werden nur in dieser Datei importiert.
- Auswirkung: Die Route ist per Login erreichbar und hat kein Eingabelimit (`docs/audit/02-security.md`, FT-SEC-09/-10). Mit ihr entfallen `ai`, `@ai-sdk/google` und der API-Schlüssel als Abhängigkeit (Pakete in FT-DEP-12, FT-DEP-13).
- Fix: Zusammen mit FT-DEAD-01 entfernen; danach `npm uninstall` der Pakete (im Dependency-Plan) und `GOOGLE_GENERATIVE_AI_API_KEY` aus `.env.example` streichen.
- Aufwand: S. Verhaltensrisiko: niedrig bis mittel (falls Robel den Chat nutzt, fehlt die Oberfläche trotzdem).

**FT-DEAD-03 (mittel): Ernährungs- und Gewichtsplan-Kette ohne Oberfläche**
- Fundstelle: `src/features/health/nutrition-plan.ts` (109 Zeilen), `nutrition-plan-schemas.ts` (37), `nutrition-config.ts` (186), `weight-trend.ts` (373), `src/features/tracking/weight-average.ts` (22), `src/lib/units.ts` (9, nur von den ersten beiden importiert), `src/services/muscle-heatmap.ts` (63, nur von `dashboard/muscle-heatmap` importiert). Tests: `nutrition-config.test.ts` (12), `nutrition-plan.test.ts` (45), `weight-trend.test.ts` (88), `weight-average.test.ts` (18).
- Belege: Erreichbarkeit ab Einstiegspunkten: diese Module werden nur von den Routen aus FT-DEAD-01 und von Tests importiert. Keine Komponente zeigt Ernährungsplan oder Gewichtstrend (`grep` nach `nutrition`, `weight-trend`, `weight-average` in `src/app` und `src/features`).
- Auswirkung: Die Körper- und Ernährungsfunktionen liegen laut README seit der Umstellung in Nexus (Abschnitt „Körpergewicht“, „Essen“). Der Gewichtspfad, den Nexus nutzt (`/api/body-weight`, `src/app/api/body-weight/route.ts`), bleibt unangetastet; er ist nicht Teil dieser Kette.
- Fix: Mit Robel bestätigen, dass Nexus die Pläne vollständig übernommen hat. Dann Module und Tests zusammen mit FT-DEAD-01 entfernen.
- Aufwand: M. Verhaltensrisiko: mittel (Abgleich mit Robel nötig; Gewichtspfad nicht berühren).

**FT-DEAD-04 (mittel): Sechs Screen-Caches und Dexie-Tabellen ohne Lese- oder Schreibpfad**
- Fundstelle: `src/lib/offline/screen-caches.ts` mit 12 nie importierten Funktionen: `saveDashboardCache`/`loadDashboardCache` (`:12`, `:18`), `saveAchievementsCache`/`loadAchievementsCache` (`:30`, `:36`), `saveMuscleHeatmapCache`/`loadMuscleHeatmapCache` (`:48`, `:54`), `saveHealthCache`/`loadHealthCache` (`:85`, `:91`), `saveBodyMeasurementsCache`/`loadBodyMeasurementsCache` (`:161`, `:167`), `saveRecordsCache`/`loadRecordsCache` (`:179`, `:185`). Dexie-Tabellen dazu in `src/lib/offline/db.ts` (`dashboardCache` `:152`, `achievementsCache` `:153`, `muscleHeatmapCache` `:154`, `healthCache` `:156`, `bodyMeasurementsCache` `:160`, `recordsCache` `:161`), in mehreren Versionsblöcken wiederholt.
- Belege: Importe in `src/`: nur `savePreviousLogsCache`, `savePlansCache`/`loadPlansCache`, `loadPlanDetailCache`/`savePlanDetailCache`, `saveExerciseDetailCache`/`loadExerciseDetailCache`, `saveMostUsedExercisesCache`/`loadMostUsedExercisesCache`.
- Auswirkung: Die Screens Dashboard, Erfolge, Muskel-Heatmap, Gesundheit, Körpermaße und Rekorde haben keinen Offline-Cache, obwohl das Modul dafür existiert. Das passt zu FT-ARCH-27 (Schema-Duplikation); eine Vermutung, dass diese Screens offline leer bleiben, ist nicht im Browser geprüft.
- Fix: Entscheiden. Entweder die Screens an die Caches anbinden (Feature) oder die Funktionen und Tabellen entfernen. Tabellen nur über eine neue Dexie-Version mit `null` löschen; vorher prüfen, dass keine Altdaten benötigt werden.
- Aufwand: M. Verhaltensrisiko: mittel (Dexie-Versionierung; Offline-Nutzer mit altem Schema).

**FT-DEAD-05 (mittel): Körpergewicht-Warteschlange ohne Produzent**
- Fundstelle: `src/lib/offline/body-weight-offline-store.ts:45` (`enqueueBodyWeightOp`) wird nirgends aufgerufen; ebenso `saveBodyWeightCache`, `loadBodyWeightCache`, `bodyWeightQueueCount`. Der Flush läuft trotzdem: `src/lib/offline/flush-all-queues.ts:16` (`flushBodyWeightQueue`), `src/components/offline-sync-provider.tsx:66`, Toast-Pfad `:104-109`. Tabellen `bodyWeightCache`, `bodyWeightQueue` in `db.ts:149-150`.
- Belege: `grep` nach `enqueueBodyWeightOp` in `src/`: nur die Definition.
- Auswirkung: Der Pfad ist tot, belegt aber Sync-Logik und Status. Die Fehler im Flush selbst beschreibt FT-ARCH-11 (Körpergewicht offline). Wer die Warteschlange entfernt, muss die Statuslogik in `offline-sync-provider.tsx` mit anpassen, sonst bleibt ein Pfad ohne Wirkung.
- Fix: Warteschlange, Flush und Toast entfernen (zusammen mit FT-ARCH-11 entscheiden) und `flush-body-weight-queue.test.ts` anpassen. Dexie-Tabellen wie in FT-DEAD-04.
- Aufwand: S-M. Verhaltensrisiko: mittel (Sync-Status; KB-11 betrifft den Sync).

**FT-DEAD-06 (mittel, Verdacht): Recovery-Widget-Brücke ohne Aufrufer**
- Fundstelle: `src/lib/native/shared-data.ts` (49 Zeilen). `syncRecoveryWidgetSnapshot` und `syncNextWorkoutWidgetSnapshot` sind exportiert, aber nirgends importiert. Der Swift-Teil `ios/App/App/SharedDataPlugin.swift:41` und `:73` schreibt `recoveryScoreSnapshot` und `nextWorkoutSnapshot` in die App-Group. Die Widgets lesen diese Schlüssel: `ios/App/RestTimerWidget/RecoveryScoreWidget.swift`, `NextWorkoutWidget.swift`, `ios/App/FitTrackComplication/FitTrackComplication.swift:26`.
- Belege: Kein JS-Aufruf von `SharedData` außerhalb von `shared-data.ts`; keine andere Swift-Stelle schreibt diese Schlüssel.
- Auswirkung: Die Widgets zeigen womöglich nie aktuelle Werte. Das ist nicht im Gerät geprüft (Swift lässt sich hier nicht kompilieren, vgl. KB-J).
- Fix: Auf dem Gerät prüfen. Wenn das Widget leer bleibt: `syncRecoveryWidgetSnapshot` nach dem Laden der Erholungsdaten aufrufen (in `BackgroundSyncManager`- oder Dashboard-Pfad). Wenn es nicht genutzt wird: Brücke und Swift-Plugin zusammen entfernen.
- Aufwand: S. Verhaltensrisiko: mittel (neuer Aufruf wirkt auf Widgets; Entfernen wirkt auf die Widgets, falls sie doch genutzt werden).

**FT-DEAD-07 (niedrig): Tote Exporte und Funktionen**
- `src/lib/offline/flush-all-queues.ts:21` `flushAllWorkoutQueues` (als `@deprecated` markiert, nie aufgerufen).
- `src/features/health/types.ts:50` `calcRecoveryScore`: nie aufgerufen. Zweite Erholungsberechnung neben `scoreFromData` (`src/features/health/recovery.ts:327`, genutzt) mit anderer Gewichtung (Schlaf 40 %). Entfernen, nicht anpassen.
- `src/features/health/types.ts:111` `formatSleepDuration`: nie aufgerufen.
- `src/lib/i18n-config.ts:10` `uiLocaleToPrisma`: nie aufgerufen.
- `src/lib/types.ts`: `ActionResult` nie benutzt (siehe FT-DEAD-09).
- `src/features/workouts/rest-timer-context.tsx:132` `useRestTimer`: nie benutzt (genutzt wird `useRestTimerActions`).
- `src/components/layout/navbar.tsx:142` `Navbar`-Alias: nie importiert (genutzt wird `MobileTopBar`).
- Nur innerhalb der Datei genutzt, Export überflüssig: `src/features/cardio/cardio-after-picker.tsx:21` (`cardioStartHref`), `src/lib/heart-rate-zones.ts:15` (`MAX_HEART_RATE`), `src/lib/offline/workout-offline-store.ts` (`isBrowserOffline`), `src/features/dashboard/queries.ts` (`computeWorkoutStreak`, `getRecentWorkouts`, `getStrengthTrendByMuscleGroup`, `getWorkoutHeatmapGrid`, `toDashboardClientPayload`, `getDashboardPayload`): genutzt über `getDashboardClientPayload`, daher nur `export` entfernen.
- Auswirkung: keine. Fix: löschen bzw. `export` entfernen.
- Aufwand: S. Verhaltensrisiko: keins.

**FT-DEAD-08 (niedrig): Vier ungenutzte shadcn-Komponenten**
- Fundstelle: `src/components/ui/select.tsx` (201 Zeilen), `sheet.tsx` (138), `tabs.tsx` (82), `separator.tsx` (25). Keine Datei importiert sie (Importgraph).
- Auswirkung: Gering; die Dateien lassen sich mit `shadcn add` jederzeit neu erzeugen.
- Fix: löschen.
- Aufwand: S. Verhaltensrisiko: keins.

**FT-DEAD-09 (niedrig): `src/lib/types.ts` ist nur über eine globale Typ-Erweiterung wirksam**
- Fundstelle: `src/lib/types.ts` (13 Zeilen). Keine Datei importiert sie. Die Datei enthält `declare module "next-auth"` (Session.user.id) und den nie benutzten Typ `ActionResult`.
- Belege: `tsconfig.json` schließt `**/*.ts` ein, deshalb wirkt die Erweiterung global. `user.id` wird im Code an mehreren Stellen gelesen (grep: 16 Treffer, darunter Nicht-Session-Code); die Erweiterung ist also nicht ungenutzt.
- Auswirkung: Wird die Datei gelöscht, ohne die Erweiterung anderswo zu setzen, schlägt `npm run typecheck` fehl oder die Session-Typen werden breiter. Das ist kein Laufzeitfehler, aber ein Typfehler im CI (`.github/workflows/ci.yml`).
- Fix: Die Erweiterung nach `src/types/next-auth.d.ts` verschieben (oder dorthin, wo `auth.ts` sie braucht), `ActionResult` löschen, dann typecheck.
- Aufwand: S. Verhaltensrisiko: mittel (nur Typen; CI prüfen).

**FT-DEAD-10 (niedrig): `Fitapp/` (Prototyp) und Konfigurationskopien**
- Fundstelle: `Fitapp/` mit 13 getrackten Dateien (`screens.jsx`, `screen-active-workout.jsx`, `screen-others.jsx`, `ios-frame.jsx`, `tweaks-panel.jsx`, `design-canvas.jsx`, `FitTrack Pro Redesign.html`, `PERFORMANCE-NOTES.md`, `uploads/`). `Fitapp/uploads/` enthält Kopien von `prisma.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `vercel.json` und die Scaffold-README.
- Belege: Nicht im Build (`next.config.ts`, `package.json`). `eslint.config.mjs` ignoriert `Fitapp/**`, `.prettierignore` ebenfalls. `Fitapp/uploads/prisma.config.ts` ist identisch zu `prisma.config.ts` und wird vom Typecheck erfasst (`tsconfig.json` schließt `**/*.ts` ein). Die anderen drei Kopien sind identisch zu den Root-Dateien.
- Auswirkung: Ca. 2.700 Zeilen Prototyp im Repo, dazu eine unnötige Typprüfung. Der Prototyp nutzt React 18 (FT-DEP-18 in `docs/audit/03-dependencies.md`).
- Fix: Mit Robel klären, ob der Prototyp als Design-Referenz bleibt. Falls ja: aus dem Repo nach außen verlagern. `Fitapp/uploads/` ohne Rückfrage löschen, da Kopien.
- Aufwand: S. Verhaltensrisiko: keins.

**FT-DEAD-11 (niedrig): Planungsdokumente und veraltete Plugin-Notiz im Root**
- `reverse-diet-bulk-plan-masterplan.md` (29.970 Byte, im Root, nirgends referenziert, „für Codex“).
- `erstelle-absoluten-masterplan-der-nifty-reef.md` (4.178 Byte, im Root, referenziert nur aus `project-docs/nutrition-planning.md`).
- `ios-native-plugin/README.md` (1.033 Byte, nirgends referenziert). Die „Files to add“ sind erledigt: `ios/App/App/HealthKitPlugin.swift` existiert. Bestehender Befund: FT-IOS-16 in `docs/audit/08-ios.md`.
- Belege: `git grep` nach den Dateinamen außerhalb von `docs/audit/`.
- Auswirkung: Rauschen im Root. Die Masterplan-Dateien sind Planung, kein Laufzeitcode.
- Fix: Masterplan-Dateien nach `project-docs/plans/` verschieben (Link in `nutrition-planning.md` anpassen); Plugin-Notiz löschen oder nach `project-docs/` verschieben. Löschen nur mit Robels OK.
- Aufwand: S. Verhaltensrisiko: keins.

**FT-DEAD-12 (niedrig): `scripts/import-workouts.mjs` ist ein einmaliges Skript mit persönlichen Angaben**
- Fundstelle: `scripts/import-workouts.mjs` (12.148 Byte). Enthält einen festen lokalen Dateipfad und eine persönliche Mailadresse im Quelltext (Werte hier nicht wiederholt). Kein npm-Skript; erwähnt nur in `.claude/settings.local.json`.
- Auswirkung: Persönliche Daten im Quelltext. Das Repo ist laut `docs/audit/02-security.md` (FT-SEC-01) öffentlich, daher zählt auch die Git-Historie.
- Fix: Mit Robel klären; das Skript löschen oder die Werte durch Umgebungsvariablen ersetzen. Wenn die Werte schon öffentlich committet sind, Historie prüfen (nicht ohne Freigabe umschreiben).
- Aufwand: S. Verhaltensrisiko: keins.

**FT-DEAD-13 (niedrig): Lokale und IDE-Dateien im Repo**
- Fundstelle: `.idea/` (6 getrackte Dateien, darunter `FitnessApp.iml`, `libraries/Fitapp.xml`), `.claude/settings.local.json` (151 Zeilen, 28 davon mit lokalen Benutzerpfaden), `project-docs/.Rhistory` (getrackt, obwohl `.gitignore` `.Rhistory` ausschließt).
- Belege: `git ls-files`; `.gitignore` enthält weder `.idea/` noch `.claude/settings.local.json`.
- Auswirkung: Lokale Pfade und Berechtigungsliste im Repo. Zu `.claude/settings.local.json` widersprechen sich zwei Befunde: FT-ARCH-26 meldet „keine Tokens gefunden“, FT-SEC-01 (kritisch) meldet Zugangsdaten der Produktionsdatenbank. Meine Stichprobe (Schlüsselwörter und Token-Muster) fand keine Treffer, das ist kein Gegenbeweis; FT-SEC-01 hat Vorrang.
- Fix: `git rm --cached` für die drei Pfade und Einträge in `.gitignore`. Historie-Bereinigung nur mit Robels Freigabe, und nach FT-SEC-01 (Schlüssel rotieren).
- Aufwand: S. Verhaltensrisiko: keins.

**FT-DEAD-14 (niedrig): Duplikate, die nicht in FT-ARCH-24 stehen**
- `calcRecoveryScore` (`src/features/health/types.ts:50`) und `scoreFromData` (`src/features/health/recovery.ts:327`) berechnen dasselbe Konzept mit anderen Gewichten. Nur das zweite ist im Einsatz (siehe FT-DEAD-07).
- `formatDuration` ist doppelt (`workout-detail.tsx:148`, `workout-history-list.tsx:40`), wie in FT-ARCH-24 vermerkt. Neu: Die Varianten unterscheiden sich bei `null` (`"—"` gegenüber `null`). Vor dem Zusammenlegen prüfen, welche Anzeige gewollt ist.
- `dateOnly`-Alias: `src/features/tracking/schemas.ts:4` und `src/features/health/nutrition-plan-schemas.ts:4` (`const dateOnly = dateOnlySchema`) sind triviale Doppelungen.
- Auswirkung: Wartungsaufwand; bei Tagesschlüssel-Änderungen (FT-ARCH-18) mehrfach zu pflegen.
- Fix: Mit FT-ARCH-24 zusammen lösen; `dateOnly`-Alias durch `dateOnlySchema` ersetzen.
- Aufwand: S. Verhaltensrisiko: niedrig.

## Geprüft, ohne Fund oder bereits erfasst

- Swift (`ios/App/`, 59 Dateien): keine eindeutig ungenutzten Dateien. Die Befunde „nicht in der Projektdatei“ bei den Watch- und Widget-Ordnern sind Fehlalarme (synchronisierte Ordner, Ausnahme nur `Info.plist`). Nicht kompiliert (KB-J).
- Ungenutzte npm-Pakete (`@ai-sdk/anthropic`, `@ai-sdk/react`, `@prisma/extension-accelerate`, plus `ai` und `@ai-sdk/google` nach FT-DEAD-02): bereits in FT-DEP-12 und FT-DEP-13 erfasst.
- `@capacitor/ios`: kein Import, aber für `cap sync` nötig (kein Befund).
- `src/lib/offline/db.ts` Typen und Versionsblöcke: Schema-Duplikation bereits in FT-ARCH-27; hier nur die ungenutzten Tabellen (FT-DEAD-04).
- `src/app/api/mcp/`, `mcp/fittrack-mcp/src/index.ts`: Einstiegspunkte, genutzt.
- `public/sw.js`: über `src/components/pwa-register.tsx` geladen (kein Befund).
- Skripte `db:seed`, `demo:ai`, `db:clear-incomplete`, `prod.sh`, `dev.sh` (von `.claude/launch.json` genutzt), `scripts/selfhost.sh`, `scripts/build-native.mjs`, `scripts/db-sync-on-build.mjs`: alle referenziert.
- Sicherheits- und Auth-Befunde (FT-SEC-*) und Architekturbefunde (FT-ARCH-*) werden hier nicht wiederholt.
- Nicht ausgeführt: Tests, Lint, Typecheck, Build. Die Baseline in `docs/audit/00-baseline.md` wurde nicht erneut geprüft.
