# Bekannte Bugs (Interview Phase 0, 2026-11-12)

Quelle: Interview mit Robel plus Vorabliste. Nichts hier ist erfunden. **Verdacht** steht nur dort, wo Robel oder die Vorabliste ihn genannt hat; sonst „–“ oder als *Vermutung* markiert. Details, die im Interview nur per Klick beantwortet wurden (Reproduzierbarkeit, seit wann, Gerät, Workaround, erwartet/tatsächlich), sind **nicht erfasst** („n. e.“ = nicht erhoben) und werden in der Bestätigungsrunde nachgefragt.

## Aus dem Interview

| ID | Repo/Bereich | Symptom | Reproduktion | Seit wann | Gerät | Schweregrad | Workaround | Verdacht | Status |
|---|---|---|---|---|---|---|---|---|---|
| KB-01 | Nexus / Arbeit tracken (Arbeitszeit/Geofence, `work.js`) | falsche Zahl/Zeit; Eintrag fehlt bzw. startet nicht; hängt/langsam/Absturz; sieht kaputt aus | n. e. | n. e. | n. e. | **blockiert mich** | n. e. | – | offen |
| KB-02 | Nexus / Heute (`#/heute`) | sieht kaputt aus | n. e. | n. e. | n. e. | kosmetisch | n. e. | – | offen |
| KB-03 | Nexus / Kalender-Stundenplan | nur KB-A (leerer Export); keine weiteren Symptome | siehe KB-A | siehe KB-A | – | kosmetisch (Robels Angabe) | `data/stundenplan-last.ics` | siehe KB-A | offen (= KB-A) |
| KB-04 | Nexus / Körper-Gewicht | falsche Zahl (neben KB-D) | n. e. (erwarteter/tatsächlicher Wert fehlt) | n. e. | n. e. | kosmetisch | n. e. | *Vermutung:* gleiches Rundungs-/Tagesschlüssel-Muster wie KB-D | offen |
| KB-05 | Nexus / Uni | sieht kaputt aus | n. e. | n. e. | n. e. | kosmetisch | n. e. | – | offen |
| KB-06 | Nexus / Roller (NIU) | sieht kaputt aus | n. e. | n. e. | n. e. | kosmetisch | n. e. | – | offen |
| KB-07 | Nexus / Login-Fernzugriff | TLS-/Verbindungsfehler | n. e. | n. e. | n. e. | **blockiert mich** | Zugriff über Funnel `:10000` | siehe KB-E/KB-F | offen |
| KB-08 | Nexus / iPhone-App, Widget, Watch | Verbindung/Login-Probleme; hängt/Absturz; sieht kaputt aus | n. e. | n. e. | iPhone (welche der drei: n. e.) | nervt | n. e. | siehe KB-E, KB-J | offen |
| KB-09 | FitTrack / Workout-Logging | hängt/langsam/Absturz; sieht kaputt aus | n. e. | n. e. | n. e. | **blockiert mich** | n. e. | *Vermutung:* `workout-detail.tsx` (~2260 Zeilen) | offen |
| KB-10 | FitTrack / Cardio-Uhr | hängt/Absturz; sieht kaputt aus | n. e. | n. e. | n. e. | **blockiert mich** | n. e. | siehe KB-J (Watch-Umbau nie kompiliert) | offen |
| KB-11 | FitTrack / Offline-Sync | Daten gehen verloren; Sync hängt/Fehler; Statusanzeige falsch | n. e. | n. e. | n. e. | **blockiert mich** | n. e. | – | offen |

Ohne bekannte Fehler (laut Robel): Lernen/Karteikarten (außer KB-C), Training, Fokus/Aufgaben, Brain/Obsidian, Post/Mail, Make/Agenten, Cargo-Spiel, FitTrack Pläne/Wochentage, Rekorde, Login/Registrierung. Depot, Essen: nicht gewählt (Depot siehe KB-B).

## Bereits bekannt (Vorabliste)

| ID | Repo/Bereich | Symptom | Status |
|---|---|---|---|
| KB-A | Nexus + uni-kalender / Stundenplan | HISinOne-Export vom 11.11. ohne Termin wurde von `uni-kalender` übernommen, Nexus-Kalender leer. Nexus-Fallback `data/stundenplan-last.ics` vorhanden; Ursache im Sync offen | offen |
| KB-B | Nexus / Depot | Position auf `XDWD.F` statt `XDWD.DE`; Kurs/Vortagesschluss/Verlauf inkonsistent; EIX-Faktor schrieb den Fehler fest. Kennung-Auswahl und Plausibilitätsprüfung geändert, **Test fehlt** | Fix vorhanden, Test offen |
| KB-C | Nexus / Karteikarten | „% sitzen“ immer 0 % (Schwelle 14 Tage, max. Abstand 7 Tage). Geändert, **Test fehlt** | Fix vorhanden, Test offen |
| KB-D | Nexus / Körper | Differenz zur Vorwoche passte wegen Rundung nicht zu den Durchschnitten; Anzeige jetzt mit 2 Nachkommastellen, **Test fehlt** | Fix vorhanden, Test offen |
| KB-E | Nexus-iPhone-App | TLS-Fehler bei „Speichern & testen“ über Tailscale-Adresse; Zugriff jetzt über Funnel `:10000`; Ursache auf dem Handy nie geklärt | offen |
| KB-F | FitTrack-App | „Sync fehlgeschlagen / TLS-Fehler“ nach Umzug auf die Mac-Adresse; Safari auf dem Handy erreichte sie ebenfalls nicht; Ursache offen | offen |
| KB-G | FitTrack / Betrieb | Vercel pausiert (Hobby-Fair-Use, bis 10.12.2026); Selbst-Hosting auf dem Mac (`scripts/selfhost.sh`) unter Last/Dauerbetrieb ungetestet | offen |
| KB-H | Mac / Node | Homebrew-Node defekt nach Update (`libsimdjson.31.dylib` fehlte); Nexus unter launchd nutzt denselben Node | offen |
| KB-I | FitTrack / Health-Sync | Tagesaktivkalorien werden bei jedem Sync überschrieben; in Apple Fitness gelöschtes Training ließ Kalorien verschwinden | offen |
| KB-J | Swift (beide Repos) | Swift-Änderungen der letzten Wochen nie kompiliert (Watch-Umbau, `DashboardView`-Login, `NexusAPI`-Fehlertext, API-Adresse in vier FitTrack-Swift-Dateien) | offen |

## Prioritäten aus dem Interview

- **Täglich genutzt, darf nie kaputtgehen:** Nexus Heute + Arbeit tracken, Körper/Essen/Depot, Lernen/Karteikarten, FitTrack Training.
- **Nie genutzt (Kandidaten zum Entfernen, nie ohne OK):** Cargo-Spiel, Make/Agenten.
- **Daten, die nie verloren gehen dürfen:** FitTrack-Workouts und Gewicht, Karteikarten/Lernstand, Essen/Aufgaben/Store.
- **Tabuzonen:** keine genannt.
- **Langsam/nervt ohne Bug:** noch nicht erfragt.
