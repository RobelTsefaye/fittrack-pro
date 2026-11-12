# Triage FitTrack (Kurzfassung)

Stand 2026-11-12. Nur FitTrack-Findings (FT-*) und die FitTrack-relevanten XR-Findings. Vollständige Fassung mit Dateien, Master-Findings, Entscheidungen und Senior-Fragen: `/home/user/own-game/docs/audit/TRIAGE.md` (Zeilennummern `#` sind dort identisch).

Kategorien: **A** automatisch fixbar, **B** nur mit Robels Review, **C** nur dokumentieren/Entscheidung, **R** nur Robel. Wellen 0 (sofort, Robel) bis 4 (Aufräumen). **seriell (Prisma-Schema):** FT-ARCH-06 zuerst, danach FT-SEC-02 (falls Tabelle), FT-SEC-05, FT-ARCH-03, FT-ARCH-17, FT-ERR-08/FT-PERF-20 – nie parallel. Swift immer B und ungetestet.

FT-IDs je Kategorie: A 27, B 126, C 22, R 7 (gesamt 182; Schwere 8 kritisch, 37 hoch, 72 mittel, 65 niedrig).

## Rang 1 (Robel, sofort)

- **FT-TOOL-01:** Exfiltrations-Workflow in `ci.yml` (`dcaad61`, `4e80e13`, `1206983`, `8335fe0`; Restore jeweils Sekunden später). GitHub-Konto sichern (Passwort, 2FA, Sitzungen, PATs, SSH-/Deploy-Keys, OAuth-/GitHub-Apps), Actions-Läufe prüfen, alle Secrets/Variablen rotieren, OIDC einschränken, Branch-Schutz `main`, Push Protection. Erst danach CI-Änderungen.
- **FT-SEC-01:** Zugangsdaten in `.claude/settings.local.json` (öffentlich, `b1ce6c0`, `4c52e65`). Neon-Passwort rotieren, **beide** `DATABASE_URL` und `DIRECT_DATABASE_URL` (Vorrang, FT-ERR-17) auf Mac und Vercel; vorsorglich `ftp_`-Tokens und `AUTH_SECRET`; Repo privat/Historie (Entscheidung); dann FT-DEAD-13.

## Bekannte Bugs (FitTrack)

| KB | Schwere | Stand | Findings |
|---|---|---|---|
| KB-09 Workout-Logging | blockiert | Ursache wahrscheinlich (1-s-Poll, Resume-Reload, Closures, stumme Fehler), nicht reproduziert | FT-ARCH-08, FT-PERF-02, FT-A11Y-01, FT-A11Y-02, FT-ARCH-09, FT-ERR-01, FT-ERR-03, FT-PERF-01/-05, FT-ERR-02 |
| KB-10 Cardio-Uhr | blockiert | teilweise (`confirm()` im WKWebView, kein Fehler/Zeitlimit, SSE-Fehler = „kein Training“, Uhr verwirft still) | FT-A11Y-04, FT-A11Y-05, FT-ERR-07, FT-IOS-03, FT-IOS-06, FT-IOS-17, FT-PERF-04 |
| KB-11 Offline-Sync | blockiert | belegt (mehrere Verlustpfade, Statusanzeige) | FT-ARCH-01..05, -11..15, FT-IOS-01/-02/-05, FT-A11Y-02/-03/-10/-18, FT-ERR-01 |
| KB-F TLS | (zu KB-07) | Hypothesen, Diagnose am Gerät | FT-IOS-08, XR-OPS-04, FT-ERR-04 |
| KB-G Selbst-Hosting | – | Lastquellen und Betriebslücken belegt | FT-ARCH-08, FT-PERF-02/-03/-04/-14, FT-ARCH-20, FT-SEC-03/-04/-19 |
| KB-I Aktivkalorien | – | Ursache belegt (kein Anchor/UUID, Überschreiben) | FT-IOS-04, FT-ARCH-17, FT-TEST-12 |
| KB-J Swift | – | lesend kein Fehler, Risiken Actor-Isolation, watchOS 26.5 | FT-IOS-10, FT-IOS-11, FT-IOS-07 |

## Tabelle

| # | IDs | Kat. | Schwere | Aufwand | Welle | Abhängigkeiten | Bug | Begründung |
|---|---|---|---|---|---|---|---|---|
| 1 | FT-TOOL-01 | **R** | kritisch | S (Robel) | 0 | – (vor jeder neuen CI-/Workflow-Arbeit in allen drei Repos) | – (nicht in KNOWN-BUGS) | Rang 1, vom Orchestrator verifiziert. Verdacht auf kompromittierten Push-Zugang; kein Refactoring, Maßnahmen nur durch Robel (Checkliste oben). |
| 2 | FT-SEC-01 (s. a. FT-ERR-17, FT-DEAD-13, FT-ARCH-26) | **R** | kritisch | S (Rotation), M (Historie) | 0 | – ; danach FT-DEAD-13 (Datei aus Git nehmen) | nie verlieren: FitTrack-Workouts/Gewicht | Rang 1. Neon-Passwort rotieren, **beide** Variablen `DATABASE_URL` und `DIRECT_DATABASE_URL` (letztere hat Vorrang, FT-ERR-17) auf dem Mac und bei Vercel; vorsorglich `ftp_`-Tokens und `AUTH_SECRET`. |
| 3 | NX-TEST-18, FT-TEST-11 | **R** | mittel | S | 0 | – | KB-04 (kosmetisch), KB-09, KB-10 (blockiert) | Braucht Robels Eingaben: erwarteter Wert KB-04, Reproduktionsschritte/Gerät KB-09/KB-10. Depot-`todo` danach B (Auslagern `quotes.js`). |
| 4 | NX-IOS-05, FT-IOS-08 | **R** | mittel | S | 0 | – | KB-07 (blockiert), KB-E, KB-F, KB-08 (nervt) | Diagnose nur auf Mac/iPhone möglich; Fehlercode (-1001/-1003/-1200/-1202) entscheidet zwischen Adresse, Schlaf, Zertifikat. Danach XR-OPS-03 (B) und XR-DOC-01 (A). |
| 7 | XR-OPS-02 | **R** | hoch | M | 0 / 2 | Entscheidung Nr. 27 (externer Dienst) | KB-G, KB-H | Mac ist Single Point of Failure ohne Alarm; Einstellungen und externer Dead-Man-Check sind Robel-Entscheidungen, Skriptteile danach B. |
| 8 | FT-SEC-22, FT-TOOL-02 | **R** | mittel | S | 0 (Einstellung) / 2 (CI-Schritt) | FT-TOOL-01 | – | Push Protection und Secret Scanning sind Repo-Einstellungen (Robel). gitleaks im CI/pre-commit erst nach Klärung FT-TOOL-01 (B-Anteil). |
| 9 | FT-DEAD-12 | **R** | niedrig | S | 0 | FT-SEC-01 (gemeinsame Entscheidung zur Historie) | – | Persönliche Angaben im öffentlichen Repo und in der Historie; Löschen/Umschreiben nur mit Robels Freigabe. |
| 10 | FT-ARCH-01, FT-ERR-01, FT-ARCH-21 | **B** | kritisch | M | 1 | FT-ARCH-04/-05 zuerst; Charakterisierungstest „fetch rejects“ | KB-09, KB-11 (blockiert); täglich: Training | Eingaben gehen verloren, wenn der Server hängt, der Browser aber „online“ meldet. `writeOrQueue` + Timeout leitet den Schreibpfad um → Review. |
| 13 | FT-TEST-01, FT-TEST-05 | **A** | hoch | M | 1-2 | – | KB-09 (blockiert); täglich: Training | Verhaltenstests für Schreibrouten (Sätze, Gewicht, Pläne, Export, Tokens) und den Nexus-Vertrag; kein Produktionscode. |
| 19 | NX-A11Y-03, FT-A11Y-04, FT-A11Y-11, NX-IOS-06 | **B** | hoch | M | 1 | – | KB-01, KB-10 (blockiert), KB-08 (nervt) | Master native Dialoge im WKWebView: `confirm/prompt/alert` tun in der App nichts (Schicht löschen, Cardio beenden). In-Page-Dialog statt nativ; Swift-Alternative (`WKUIDelegate`) ungetestet. |
| 20 | FT-ARCH-04, FT-ARCH-05, FT-ARCH-13, FT-ARCH-14, FT-ARCH-12 | **B** | hoch | S | 1 | FT-TEST-06; vor FT-ERR-05 | KB-11 (blockiert) | Kleine Sofortmaßnahmen aus der Offline-Sync-Entscheidung (Mapping nicht zu früh löschen, Queue ohne Snapshot nicht löschen, Sortierung atomar). Datenpfad → Review, je Fix eigener Commit. |
| 21 | FT-A11Y-02 | **B** | hoch | S | 1 | – | KB-09, KB-11 (blockiert) | Resume/Navigation lädt das Workout mit Skeleton neu und zerstört halb eingetippte Satzwerte; kleiner Diff, aber UI-Verhalten. |
| 22 | FT-ARCH-08, FT-PERF-02, FT-A11Y-01, FT-PERF-06 | **B** | hoch | M | 1 | FT-A11Y-02; Gerätetest mit Watch | KB-09 (blockiert), KB-G | 1-s-Poll ohne Guard ist der wahrscheinlichste Hänger-Treiber; ändert Watch-Synchronität → Test auf dem Gerät. |
| 23 | FT-ERR-03 | **B** | hoch | S | 1 | – | KB-09 (blockiert) | Keine Fehlerseiten: Renderfehler = weiße Seite mitten im Training. Neues UI, Native-Export prüfen. |
| 24 | FT-A11Y-05, FT-ERR-07 | **B** | hoch | S-M | 1 | – | KB-10 (blockiert) | Cardio-Live zeigt keine Fehler, wartet ewig und meldet DB-Fehler als „kein Training“. |
| 25 | FT-IOS-03, FT-IOS-06, FT-IOS-17 | **B** | hoch | M | 1-2 | – | KB-10 (blockiert), KB-J | Uhr verwirft Einheiten still bei `finishWorkout`-Fehler, keine Timeouts. Swift **ungetestet**. |
| 26 | FT-IOS-01, FT-IOS-02, FT-IOS-05, FT-ARCH-16 | **B** | hoch | S-M | 1 (FT-IOS-02) / 2 | – | KB-11 (blockiert), KB-J | Native Offline-Store: Wettlauf Replay/Editor, `try?`-Dekodierung leert Listen, Reconcile löscht fremde Server-Daten. Swift **ungetestet**. |
| 27 | FT-SEC-03, NX-SEC-01, NX-SEC-03 (s. a. NX-SEC-04, NX-SEC-12, FT-SEC-09, FT-SEC-11) | **B** | hoch | M | 1-2 | Entscheidung Nr. 5 (Sicherheitsmodell); KB-07-Diagnose (Funnel `:10000` ist Workaround) | KB-07 (blockiert, indirekt) | Master Rate-Limits: Nexus-Bearer ohne Limit, Limiter hinter Funnel gemeinsam (DoS), FitTrack gar keins. Sicherheitsmodell, eigenes App-Token ändert Shortcuts/App. |
| 28 | FT-TEST-13, FT-TEST-06, FT-TEST-12 | **A** | mittel | S | 1 | – | KB-11 (blockiert), KB-I | Drei `todo` sofort aktivierbar bzw. als Charakterisierungstest (Ist-Verhalten), keine neuen Abhängigkeiten. |
| 29 | XR-DOC-01, NX-IOS-20, FT-IOS-16 | **A** | mittel | S | 1 | NX-IOS-05 (Diagnose bestätigt Adresse) | KB-07 (blockiert), KB-E, KB-08 (nervt) | Doku sagt Nexus-Adresse ohne Port, seit Selbst-Hosting gehört sie FitTrack; Doku-Korrektur ist risikofrei, der Swift-Hinweistext ist B (ungetestet). |
| 30 | XR-OPS-01, NX-ARCH-10, NX-ERR-13 | **B** | hoch | M | 1 | NX-ARCH-02 (gemeinsames `lib/jsonfile.js`); Neon-Teil: Robel (Restore-Fenster prüfen) | nie verlieren: Store/Karten/Essen, FitTrack-Workouts/Gewicht | Kein Backup von `data/` und Neon; Tagesrotation, atomare Schreiber, Dump vor Schema-Sync. Infrastruktur und Datenpfad → B; Kopie außerhalb des Macs und Restore-Probe: Robel. |
| 33 | FT-SEC-02, XR-SEC-01, FT-ERR-16, FT-SEC-14, FT-SEC-20 | **B** | kritisch | M | 1 | FT-TEST-03; Entscheidung Nr. 4; falls DB-Tabelle (Clients/Nonce): Prisma-Kette nach FT-ARCH-06 | – | Master OAuth-authorize: Dauer-Vollzugriffs-Token an fremde `redirect_uri`. Sicherheitsmodell → B; Sofortoption: Route abschalten, wenn Remote-MCP ungenutzt. |
| 34 | FT-DEP-01, FT-DEP-02, FT-DEP-08 | **B** | kritisch | M | 1 | FT-TEST-01 hilfreich | KB-G | Kritische Advisories auf der öffentlichen Instanz; Minor-/Beta-Sprünge mit Verhaltensrisiko mittel → nicht automatisch. |
| 35 | FT-TEST-03, FT-TEST-02 | **A** | hoch | S-M | 1 | – | – | Nur Tests; `it.fails` hält die OAuth-Lücke sichtbar, bis der Fix kommt. |
| 36 | FT-SEC-04, XR-SEC-03, FT-SEC-08, FT-SEC-21 | **B** | hoch | S | 1 | Entscheidung Nr. 3 | – | Offene Registrierung auf der öffentlichen Instanz (CPU, DB, KI-Kontingent), Konto-Orakel, schwache Passwortregel. Schalter per Env ändert Verhalten bewusst. |
| 39 | NX-ARCH-19, NX-DEP-01, FT-DEP-16 | **A** | mittel | S | 1 | – | KB-H | Master Node-Version: Deklaration ist mechanisch und ohne Laufzeitwirkung; Startcheck mit Meldung (NX-ARCH-19) wäre Verhalten → B. Node auf dem Mac pinnen: R (XR-OPS-02). |
| 41 | FT-DEAD-13 | **A** | niedrig | S | 1 | FT-SEC-01 (erst rotieren) | – | `git rm --cached` + `.gitignore`; ändert kein Verhalten. Historie bleibt (R-Entscheidung). |
| 42 | FT-ARCH-02 | **B** | kritisch | M | 2 | FT-ARCH-04/-05; FT-TEST-04 (Freigabe `fake-indexeddb`) | KB-11 (blockiert) | Rekey-Wettlauf beim Reconnect löscht Satzdaten als „Erfolg“. Kurzfristig Mutex/Alias; strukturell durch FT-ARCH-03. |
| 44 | FT-ARCH-15, FT-A11Y-03, FT-A11Y-10, FT-A11Y-18, FT-TEST-07 | **B** | hoch | M | 2 | FT-ARCH-04/-05 | KB-11 (blockiert, Statusanzeige) | Permanente Fehler blockieren die Queue, Status nur aus `navigator.onLine`, kein „ausstehend/fehlgeschlagen“. Dead-Letter + dauerhafte Anzeige = Verhalten. |
| 45 | FT-TEST-04, FT-TEST-08, FT-TEST-10 | **B** | hoch | M-L | 2 | Entscheidung Nr. 20 (Dev-Abhängigkeiten) | KB-11, KB-09 (blockiert) | Tests selbst risikofrei, brauchen aber neue Abhängigkeiten (`fake-indexeddb`, Coverage, Playwright) → Freigabe. |
| 46 | FT-PERF-01, FT-PERF-05, FT-ERR-02 | **B** | hoch | M | 2 | `personal-record`-Test um Reihenfolge erweitern; FT-TEST-01 | KB-09 (blockiert) | N+1 beim Beenden, 7 sequentielle Queries je Satz, nicht atomar (Rekord kann verloren gehen). Rekord-Semantik → Review. |
| 47 | FT-ARCH-09, FT-A11Y-17, FT-TOOL-04 | **B** | hoch | M | 2 | FT-ARCH-08 | KB-09, KB-11 (blockiert) | Veraltete Closures und Zustand aus `setState`-Updater: Op nie eingereiht, Snapshot überschrieben. Reducer-Umbau mittleres Risiko. |
| 48 | FT-PERF-04, FT-SEC-11 | **B** | hoch | M | 2 | – | KB-10 (blockiert), KB-G | Jeder Web-Tab fragt die DB alle 300 ms ab, Streams unbegrenzt. Realtime-Pfad → Gerätetest. |
| 49 | FT-PERF-03, FT-PERF-14 | **B** | hoch | S | 2 | Neon-Autosuspend: Robel (Konsole) | KB-G, KB-09 (blockiert, „hängt“) | Pool schließt Neon-Verbindungen nach 10 s, kein Connection-Timeout, Kaltstart nach Update. Betrieb → B. |
| 50 | FT-ARCH-11, FT-DEAD-05 | **B** | hoch | S | 2 | zuerst klären: Warteschlange hat keinen Produzenten (FT-DEAD-05) | KB-11 (blockiert); nie verlieren: Gewicht | Widerspruch der Reports: Fehler im Gewicht-Flush (FT-ARCH-11) liegt in einem Pfad ohne Schreiber (FT-DEAD-05). Entfernen oder reparieren → Robel. |
| 52 | FT-ERR-04, FT-ERR-05, FT-ERR-18 | **B** | mittel | S | 2 | FT-ARCH-04 (sonst behandelt der Flush neue 404 als Erfolg) | KB-F, KB-11 (blockiert) | Serverausfall erscheint als „Passwort falsch“; Prisma-Fehler werden 500. Fehlerabbildung wirkt auf den Offline-Flush → Reihenfolge beachten. |
| 53 | FT-A11Y-09, FT-A11Y-16 | **B** | mittel | S | 2 | – | KB-09 (blockiert), KB-F | `rekeyRedirecting` wird nie zurückgesetzt (Skeleton für immer), Auth-Gate ohne Zeitlimit. |
| 54 | XR-OPS-03 | **B** | mittel | S | 2 | NX-IOS-05 (Diagnose) | KB-07 (blockiert), KB-E | Wächter kann :443 (FitTrack) überschreiben und stellt :10000 nie wieder her (Vermutung, Log prüfen). |
| 58 | XR-API-06, NX-TEST-08, NX-TEST-09 | **A** | mittel | M | 2 | – | KB-08 (nervt) | Contract-Tests ohne Produktionscode; Normalisierung von `snapshots[].date` wäre B (nicht Teil davon). |
| 63 | NX-ARCH-07, NX-ARCH-08, NX-ARCH-13, NX-ARCH-14, NX-ARCH-15, NX-ARCH-21, NX-DEAD-13, NX-IOS-17, FT-ARCH-18, FT-ARCH-24, FT-DEAD-14, FT-IOS-15, XR-API-04 | **B** | mittel | M | 2 | zuerst TZ-Charakterisierungstests (A, Muster `depot.test.js`) | KB-04, KB-D (kosmetisch), KB-B; täglich: Depot/Körper | Master Tagesschlüssel UTC/lokal (beide Repos + Swift). Zahlen an Tagesgrenzen ändern sich sichtbar; Swift-Anteile ungetestet. |
| 64 | XR-API-03, NX-A11Y-18 | **B** | mittel | S | 2 | Vertrag festlegen (FitTrack `null` oder Konsument prüft `level`) | KB-02 (kosmetisch); täglich: Heute | „Erholung 0“/roter Ring statt „keine Daten“. Kleiner Vertragsfix, sichtbare Anzeige ändert sich. |
| 70 | FT-ARCH-06, FT-ARCH-07, FT-ARCH-19 | **B** | hoch | M | 2 | Backup/Neon-Branch (XR-OPS-01, Robel); **erster Schritt der Prisma-Kette** | – | Schema-Drift (6 Tabellen, 1 Enum, 1 Spalte ohne Migration), Schema-Sync auf dem Mac still übersprungen, `db push`-Fallback gegen geteilte DB. Prod-DB → nur mit Backup und Review. |
| 71 | FT-SEC-05, XR-SEC-02, FT-SEC-06, NX-SEC-08 | **B** | hoch | M | 2 | Doku-Korrektur sofort (XR-DOC-02); Prisma-Kette nach FT-ARCH-06; Entscheidung Nr. 26 | – | Tokens ohne Ablauf/Scope können weitere Tokens erzeugen; Nexus verteilt das Token ans Handy. Sicherheitsmodell, bestehende Tokens behalten `expiresAt = null`. |
| 72 | NX-SEC-07, NX-IOS-03, NX-IOS-04, NX-IOS-13, NX-IOS-14, FT-SEC-15, FT-IOS-12 | **B** | hoch | M | 2 | Entscheidung Nr. 5 und Nr. 28 | KB-E, KB-J | Passwort im Klartext an gemerkte LAN-IP, ATS komplett aus, Sessions nicht widerrufbar. Sicherheitsmodell + Swift **ungetestet**. |
| 73 | FT-DEP-03, FT-DEP-04, FT-DEP-05, FT-DEP-06, FT-DEP-07 | **B** | hoch | S-M | 2 | FT-DEP-01 zuerst | KB-J (Capacitor-Build) | Hohe/kritische Advisories (Capacitor, Prisma, Zod, MCP-SDK, shadcn). Capacitor braucht Xcode-Build durch Robel. |
| 75 | FT-ARCH-10, FT-IOS-07, XR-OPS-04 | **B** | hoch | M | 2 | – | KB-G, KB-F, KB-J | Master API-Ursprung an 5 Stellen: Rollback/Umzug nur per Neubau. Swift **ungetestet**, Xcode durch Robel. |
| 78 | FT-ARCH-20, FT-SEC-19, XR-SEC-06 | **B** | mittel | M | 2 | – | KB-G | Update baut im laufenden Dienst ohne Rollback, `npm install`, Bind `0.0.0.0`, `?token=`. Infrastruktur; LAN-Zugriff per IP entfällt. |
| 79 | NX-ERR-17, FT-ERR-06, FT-SEC-17 | **B** | mittel | M | 2 | – | KB-07/KB-E/KB-F (Ursache `e.cause` fehlt), KB-09/KB-10/KB-11 (Telemetrie) | Master Logging: ohne Datum/Ursache/Rotation, Gesundheitsdaten im Klartext-Log. Infrastruktur → B. |
| 80 | NX-SEC-06, FT-SEC-07 | **B** | mittel | M | 2 | – | – | Keine Security-Header in beiden Apps; CSP zuerst Report-Only (Inline-Styles/Skripte). |
| 81 | FT-DEP-11, FT-TEST-09, FT-TEST-14, NX-TEST-06, NX-DEP-12 | **B** | mittel | S | 2 | FT-TOOL-01 geklärt, Branch-Schutz aktiv | – | Master CI: Nexus hat keine CI, FitTrack-CI ohne Audit/MCP-Build. CI war der Exfiltrationsweg → nur ohne Secrets, `permissions: read`, nach Kontosicherung. |
| 83 | FT-DEP-10, FT-TOOL-07, FT-DEP-14, FT-DEP-13 | **A** | mittel | S | 2 | – | – | `dotenv` deklarieren, ungenutzte Pakete (`@prisma/extension-accelerate`, `@ai-sdk/react`, `@ai-sdk/anthropic`, `@types/bcryptjs`) entfernen; Typecheck/Build/Tests sichern ab. |
| 85 | FT-ERR-11, FT-DEAD-02, FT-ERR-10, FT-ERR-12, FT-ERR-14, FT-SEC-09 | **C** | mittel | S | 2 (Entscheidung) | Entscheidung Nr. 18 | – | `/api/chat` ohne Aufrufer, aber per offener Registrierung erreichbar, ohne Limit, Datenfluss an Google. Entfernen empfohlen, nur mit OK. |
| 87 | FT-SEC-12, FT-SEC-13, FT-SEC-18 | **B** | niedrig | S | 2 | – | – | Kleine Sicherheitsfixes (Übungs-Sichtbarkeit, Push-Token-Umhängen, Fehlerdetail-Leck); Antworten ändern sich. |
| 89 | XR-DOC-02, XR-DOC-03, FT-ARCH-22, NX-TEST-17, XR-OPS-05, NX-ERR-21, FT-ERR-17, FT-DEP-17, NX-DEP-04, NX-DEP-05, NX-DEP-06, NX-DEP-07, NX-DEP-10, UK-DOC-01 | **A** | niedrig | S | 2 | **CLAUDE.md-Änderungen nur durch Robel** (Push-Regel, Tech-Stack) | – | Master Doku-Drift + Rotationsanleitung + Lizenzen: reine Doku. Token-Scope-Aussage (XR-SEC-02) sofort an Ist-Zustand anpassen. |
| 90 | FT-ARCH-03 | **C** | hoch | L | 3 | FT-ARCH-01/-02/-04/-05 (Sofortmaßnahmen zuerst); Prisma-Kette nach FT-ARCH-06; Entscheidung Nr. 12 | KB-11 (blockiert) | Grundsatzfrage Offline-Sync: Idempotenz lässt sich nicht lokal flicken (3 Sync-Protokolle). Zielmodell Client-UUIDs + Batch, kein CRDT. |
| 92 | FT-ERR-08, FT-PERF-20 | **B** | mittel | M | 3 | FT-ARCH-06; Dubletten in Prod vorher prüfen | KB-09 (blockiert, „komische Reihenfolge“) | Unique-Index kann Migration auf Bestandsdaten blockieren. |
| 93 | FT-PERF-12 | **B** | mittel | S | 3 | – | KB-09 (blockiert, „hängt“) | Network-first ohne Timeout, tote Vorlade-Routen; Offline-Verhalten → Gerätetest. |
| 94 | FT-PERF-07, FT-PERF-08, FT-PERF-09, FT-PERF-10, FT-PERF-11, FT-PERF-13, FT-PERF-15, FT-PERF-16, FT-PERF-19 | **B** | mittel | M | 3 | FT-ARCH-18 (Tagesgrenzen) für FT-PERF-16 | KB-09 (blockiert, „Delay“) | Caching/Bundle/Export/Locale; meist niedriges Risiko, Aktualität teils anders. |
| 96 | FT-ARCH-25, FT-TOOL-05 | **B** | niedrig | L | 3 | FT-ARCH-08/-09, FT-ERR-01 | KB-09 (blockiert) | Zerlegung in 7 Schritten; 1-3 mechanisch, 4-6 nur mit Gerätetest. |
| 98 | FT-A11Y-06, FT-A11Y-08, FT-A11Y-12, FT-A11Y-14, FT-A11Y-15, FT-A11Y-24 | **A** | mittel | S | 3 | – | täglich: Training | ARIA-Attribute und i18n-Schlüssel (Paritätstest vorhanden); 44-px-Größen gehören zum B-Paket. |
| 100 | FT-ARCH-17, FT-IOS-04 | **C** | hoch | L | 3 | FT-TEST-12; FT-ARCH-06; Entscheidung Nr. 13 | KB-I | Ursache belegt (keine UUID, kein Anchor, blindes Überschreiben). Merge-Semantik ist Produktentscheidung, Schema + Swift → dokumentieren, dann B. |
| 101 | NX-ERR-12, NX-ERR-15, FT-SEC-10 | **B** | mittel | M | 3 | – | – | KI-Aufrufe ohne Timeout/`stop_reason`/Backoff, Prompt-Injection über Mailtext. Ausgaben ändern sich leicht. |
| 103 | FT-ERR-09, FT-ERR-13, FT-ERR-15 | **B** | mittel | M | 3 | FT-ERR-06 | – | Rohe Fehlertexte an externe Agenten, Fehlerzustände unsichtbar, MCP-Brücke ohne Timeout. |
| 104 | FT-IOS-09, FT-IOS-10, FT-IOS-11, FT-IOS-13, FT-IOS-14 | **B** | mittel | S | 3 | watchOS-Version der Uhr prüfen (Robel) | KB-J | Thread-Sicherheit, Actor-Isolation, Deployment-Ziel 26.5, Imports. Swift **ungetestet**. |
| 105 | FT-DEP-09, FT-DEP-12, FT-DEP-15 | **B** | mittel | M | 3 | FT-DEP-01; Entscheidung Nr. 21 | – | Major-/Beta-Planung, nicht über `npm update`. |
| 106 | FT-DEAD-06 | **C** | mittel | S | 3 | Gerätetest (Robel) | KB-J | Verdacht: Recovery-/Next-Workout-Widget wird nie befüllt; erst auf dem Gerät prüfen. |
| 109 | FT-SEC-16, FT-ARCH-23, FT-PERF-18 | **B** | niedrig | M | 3 | – | – | Umbenennung + Default-Deny; Native-Build hängt am Dateinamen. |
| 115 | FT-A11Y-07, FT-A11Y-13, FT-A11Y-19, FT-A11Y-20, FT-A11Y-21, FT-A11Y-23 | **B** | mittel | S | 4 | – | – | Fokusringe, Kontrast hell, Touch-Ziele: sichtbare Änderungen. |
| 120 | FT-DEAD-01, FT-DEAD-03 | **C** | mittel | M | 4 | Abgleich externe Aufrufer mit Robel | – | Kandidat ungenutzte FitTrack-Routen (656 Zeilen) und Ernährungskette; Gewichtspfad `/api/body-weight` nicht berühren. |
| 122 | FT-DEAD-07, FT-DEAD-08, FT-DEAD-09, FT-TOOL-06 | **A** | niedrig | S | 4 | – | – | Tote Exporte ohne Aufrufer; knip-Treffer nur nach Einzelprüfung (False Positives in `mcp/`, `scripts/`). |
| 124 | FT-ARCH-27, FT-DEAD-04 | **C** | niedrig | M | 4 | Entscheidung: Screens anbinden oder Tabellen entfernen | KB-11 (indirekt) | Dexie-Versionierung betrifft Offline-Nutzer mit altem Schema; ungenutzte Caches. |
| 126 | FT-DEAD-10, FT-TOOL-03, FT-DEP-18 | **C** | niedrig | S | 4 | Entscheidung (Design-Referenz?) | – | Kandidat Prototyp; `Fitapp/uploads/prisma.config.ts` wird vom Typecheck erfasst. |
| 127 | FT-DEAD-11, FT-ARCH-26 | **C** | niedrig | S | 4 | OK von Robel | – | Kandidat Root-Masterplan-Dateien: nach `project-docs/plans/` verschieben oder löschen. |
| 130 | FT-TOOL-08, FT-PERF-17, FT-A11Y-22, UK-SEC-01 | **C** | niedrig | – | – | – | – | Nur dokumentieren: kein Handlungsbedarf bzw. dort behandelt (NX-SEC-13, NX-ARCH-12). |

## Wichtigste Entscheidungen (FitTrack)

Nr. 2 Repo privat/Historie, Nr. 3 Registrierung schließen, Nr. 4 Remote-MCP reparieren oder abschalten, Nr. 12 Offline-Sync-Zielmodell (stärkeres Modell sinnvoll, aber nach Welle 1), Nr. 13 KB-I-Merge, Nr. 18 `/api/chat` entfernen, Nr. 20 Dev-Abhängigkeiten, Nr. 21 `next-auth`, Nr. 25 watchOS-Ziel, Nr. 26 Token-Scopes. Wortlaut und Empfehlungen in der Gesamt-Triage.
