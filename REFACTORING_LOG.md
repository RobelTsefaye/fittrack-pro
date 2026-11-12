# Refactoring-Log FitTrack (Audit 2026-11)

Branch `refactor/audit-2026-11` (nichts gepusht). Details: `docs/audit/TRIAGE.md`, `docs/audit/REVIEW.md`.

## Dringend, nur du (Rang 0)
- **FT-TOOL-01:** In der CI-Historie von `main` stecken Commits (`dcaad61`, `4e80e13`, `1206983`, `8335fe0`, jeweils gefolgt von „ci: restore“), die Secrets abgreifen. Konto sichern, Actions-Läufe prüfen, Secrets rotieren, Branch-Schutz.
- **FT-SEC-01:** Datenbank-Zugangsdaten in `.claude/settings.local.json` (Commits `b1ce6c0`, `4c52e65`): Neon-Passwort rotieren, **beide** Variablen `DATABASE_URL` und `DIRECT_DATABASE_URL`.

## Erledigt
| ID | Commit (Merge) | Beschreibung | Testnachweis |
|---|---|---|---|
| Baseline | 4658f30 | Characterization-Tests: Auth-Abdeckung aller 80 `route.ts`, Zod-Schemas, `withApi`, Offline-Queue, Health-Upsert, i18n-Parität | 62 → 178 Tests |
| FT-TEST-01, -02, -03, -05, -06, -12, -13 | 9b2fa75, c62c576, e110b5b | Schreibrouten-, Recovery-, Kontext-, OAuth- und Mandantentests; `todo` aktiviert; OAuth-Lücke als `it.fails` (FT-SEC-02, FT-SEC-12) | 364 Tests |
| FT-DEP-16 | ee31cd5 | `.nvmrc` (engines `>=20.9.0` bleibt, Next 16) | – |
| FT-ARCH-01, -02, -05 (B3) | 5995f10, df28377, e56f08a | Offline-Sync: Netzfehler/502/503/504 → Queue, Anlege-POSTs ohne Timeout, Ops während Flush überleben, Queue ohne Snapshot bleibt, `delete_we` 404 ok, Alias vor Snapshot | `flush-workout-queue.test.ts`, `write-or-queue.test.ts` (403 Tests) |
| FT-ARCH-08, FT-PERF-03 (P1) | bf90e8f | Poll mit In-Flight-Guard und 10-s-Timeout; Pool-Leerlauf 60 s | `guarded-poll.test.ts` |
| Doku | df28377, e56f08a | `project-docs/` (Offline-Queue, Poll, Pool, Node 22), `CLAUDE.md` (Next 16, Capacitor, Selbst-Hosting) | – |
| FT-ERR-01/-02 (B4), FT-SEC-02 (B7), FT-SEC-04/-03 (B8) | 54e9c56, f44e2e3, ff884ec | Satz-Speichern zeigt Fehler und behält Eingaben, PATCH/DELETE atomar; OAuth: signierte client_id, exakte redirect_uri, nur PKCE S256 (Connector muss neu autorisiert werden); Registrierung `FITTRACK_REGISTRATION` Standard geschlossen (Bootstrap ohne Nutzer), Rate-Limit Login/Registrierung | 438 Tests |

## Offen (B/C)
Siehe `docs/audit/TRIAGE.md`. Wichtigste: FT-SEC-02 Rest (Einmal-Code, Token-Ablauf, Zustimmungsseite; braucht Schema), FT-SEC-04 Rest (Zod-Maximallängen, Body-Limit), FT-DEP-01/-02 kritische Paket-Updates (`next`, `next-auth`, `@capacitor/ios`; M, braucht Build auf dem Mac), FT-ARCH-06/-07/-19 Schema-Drift und `db push`-Fallback (M–L, Prisma seriell), FT-ARCH-09 (memo/Closure), Offline-Sync-Zielmodell (Entscheidung 12), FT-PERF-01/-02/-04, FT-ERR-03 (`error.tsx`).
Restrisiko aus der Gegenprüfung: kein automatischer Retry bei „online, aber Server down“, Reihenfolge direkter Write gegen Queue, Doppel-Risiko bei Netzfehler nach Commit, Dauer-Toast bei Queue ohne Snapshot.

## Bewusst nicht gefixt
- Prisma-Schema, Migrationen, Abhängigkeiten, Swift, API-Verträge: unverändert (Review geprüft).
- `.claude/settings.local.json` bleibt vorerst getrackt (erst nach Rotation, Zeile 41).
- Commit 8b72d24 hat keinen `Co-Authored-By`-Trailer (gemergte Historie).

## Bekannte Bugs (Stand)
| KB | Status | Nachweis / Stand |
|---|---|---|
| KB-01 Arbeit tracken (blockiert) | **teilweise behoben** | `work.js`: fehlendes „home“ löscht die Folgeschicht nicht mehr (Commit 8b05129, Merge 7f66db7; Test `tests/work.test.js`). Offen: Randfall (work 07:00, work 20:00, home 02:00, als `todo`), Lost Update im Store (NX-ARCH-01, Entscheidung 6), iOS-Outbox (NX-IOS-01/-02, Swift) |
| KB-02 Heute (kosmetisch) | offen | keine Reproduktion; Verdacht: fehlender Fehlerrand um `render()` (NX-A11Y-01/-02) |
| KB-03 / KB-A Stundenplan | **offen** (Ursache im Sync unbekannt) | Fallback `data/stundenplan-last.ics` vorhanden und getestet. uni-kalender: Prüfskript `scripts/check-ics.js` (5 Tests), noch keine Action. Ein Export mit nur 1 Termin überschreibt die gute Kopie (`todo`, NX-ARCH-09) |
| KB-04 Körper, falsche Zahl | offen | erwarteter Wert fehlt; Verdacht Tagesschlüssel UTC/lokal (NX-ARCH-15); `todo` in `tests/bulk.test.js`/`tests/routes-body.test.js` |
| KB-05 Uni, KB-06 Roller (kosmetisch) | offen | keine Reproduktion; KB-06: kein Neu-Login bei HTTP 401 der NIU-Cloud (NX-ERR-03, Ist-Test) |
| KB-07 / KB-E / KB-F Verbindung/TLS | **offen** | Diagnose nur auf Mac/iPhone möglich (Fehlercode, `tailscale serve/funnel status`); Hypothesen in `10-api-vertrag-betrieb.md` (XR-API-01, Port 443/Funnel) |
| KB-08 Nexus-iPhone-App | offen | nur lesend geprüft (`08-ios.md`), Swift nicht kompiliert |
| KB-09 FitTrack Workout-Logging (blockiert) | **teilweise behoben** | Poll mit In-Flight-Guard und 10-s-Timeout (Merge bf90e8f), Pool-Leerlauf 60 s; offen: FT-ARCH-09 (memo/Closure), Zerlegung `workout-detail.tsx` |
| KB-10 Cardio/Uhr (blockiert) | offen | Swift, nur lesend (`08-ios.md`) |
| KB-11 Offline-Sync (blockiert) | **teilweise behoben** | Fehler → Queue, Ops während Flush, Alias, Queue ohne Snapshot bleibt (Merges 5995f10, df28377, e56f08a). Offen: Retry bei „online, aber Server down“, Dead-Letter, Client-UUIDs, Reihenfolge direkter Write/Queue (Entscheidung 12) |
| KB-B Depot | Fix im Code, **Test jetzt vorhanden** | `tests/depot.test.js`; Funktionen nicht exportiert (Quelltext per `vm` geprüft) |
| KB-C „% sitzen“ | **behoben, Test vorhanden** | `tests/srs.test.js`, `tests/cards.test.js` |
| KB-D Wochendifferenz | **behoben (2 Nachkommastellen), Test vorhanden** | `tests/bulk.test.js` (Rest 0,01 dokumentiert) |
| KB-G Selbst-Hosting | offen | Poll-Guard und Pool-Timeout helfen; Dauerbetrieb nicht gemessen |
| KB-H Node auf dem Mac | **teilweise** | `engines` und `.nvmrc` deklariert; Node auf dem Mac pinnen: Aufgabe für dich |
| KB-I Tagesaktivkalorien | offen | Überschreiben per Test belegt (600 → 120); Merge-Semantik: Entscheidung 13 |
| KB-J Swift nie kompiliert | offen | lesend kein Kompilierfehler erkennbar; Beweis nur in Xcode |

## Testlage
Vorher 62 Tests (15 Dateien), nachher 403 Tests (41 Dateien, 11 `todo`). `npm run lint`, `npm run typecheck`, `npm run build` (Platzhalter-Env) grün. Nicht getestet: iPhone, Watch, echte Neon-DB, echte Dexie-Transaktionen (Store gemockt).

## Neue Befehle
Keine. `.nvmrc` (Node 22).
