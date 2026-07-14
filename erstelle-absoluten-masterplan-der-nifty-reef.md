# Nifty Reef — Masterplan

**Produktziel:** FitTrack Pro wird zur verlässlichen, offlinefähigen Trainings-App, die bei jeder Einheit Reibung senkt und nachvollziehbare nächste Schritte anbietet.

## Nordstern

Ein Nutzer startet ein Training in unter 30 Sekunden, kann ohne Netz trainieren und bekommt nur Empfehlungen, die er versteht und aktiv übernehmen kann.

## Prioritäten

| Priorität | Initiative | Erfolgskriterium |
| --- | --- | --- |
| P0 | Verlässlichkeit und Messbarkeit | Kernflüsse sind testbar; Offline- und Sync-Zustände bleiben verständlich. |
| P1 | Intelligentes Satz-Logging | Progression und Aufwärmen sparen Eingaben, ohne Werte ungefragt zu ändern. |
| P1 | Aktivierung und Planstart | Ein neuer Nutzer beendet sein erstes Training ohne manuelles Setup. |
| P2 | iOS-Widget | Nächstes Training und Streak sind auf dem Home Screen sichtbar. |
| P2 | Coach-Insights | Wenige, priorisierte und begründete Hinweise statt Datenrauschen. |
| P3 | Release-Reife | Branding, Store-Entscheidung, Push nach Apple-Upgrade. |

## Lieferwellen

### Welle 0 — Fundament

- Produkt- und Fehlerereignisse für Workout-Start, Satz-Logging, Synchronisierung und Vorschlagsannahme definieren.
- Kernflüsse abdecken: Anmeldung, Start, Satz ändern, Abschluss, Offline-Start und Queue-Flush.
- Jede neue Mutation benötigt Zod-Validierung, verständliche Fehlerzustände und EN/DE-Texte.

### Welle 1 — Intelligentes Trainingslogging

- [x] **Aufwärm-Rampe:** Ein Tap erzeugt 50/70/85-%-Sätze mit 8/5/3 Wiederholungen auf Basis des ersten Arbeitssatzes. Gewichte werden auf 2,5 kg bzw. 5 lb gerundet; vorhandene Aufwärmsätze werden nicht dupliziert.
- [x] **Online und offline:** Die Rampe nutzt online die bestehende Set-API und offline die lokale Workout-Queue bzw. die Watch-Pending-Session.
- [x] **Progression v1:** Der letzte Arbeitssatz ist die Regel: unter 5 Wiederholungen hält das Gewicht; ab 5 Wiederholungen erhöht die App um 2,5 kg (bzw. 5 lb). Die Aufwärm-Rampe übernimmt diesen Wert automatisch.
- [x] **Vertrauensprinzip:** Empfehlungen sind sichtbar begründet, werden gecacht und ändern keine Werte ohne „Übernehmen“.
- [ ] Verhalten anhand realer anonymisierter Trainingsverläufe kalibrieren; Annahme/Ablehnung messen.

### Welle 2 — Aktivierung

- Kurz-Onboarding für Ziel, Erfahrungsniveau, verfügbare Tage und Einheit.
- Editierbaren Startplan vorschlagen; Onboarding überspringbar und später anpassbar.
- Leere Zustände im Dashboard, in Plänen und in der Historie als klare Startpunkte ausführen.

### Welle 3 — iOS-Sichtbarkeit

- Kleine und mittlere Widget-Familie für nächstes Training, Streak und letzten Sync.
- App-Group als last-known state verwenden; keine sensiblen Gesundheitswerte auf dem Sperrbildschirm.
- Deeplink in die bestehende native Routing-Strategie prüfen.

### Welle 4 — Coach und Release

- Heuristiken für Plateau, Deload, Volumen und Streak zu einer priorisierten Handlungsempfehlung verdichten.
- Jede Empfehlung erklärt Beobachtung, Aktion und Datengrundlage; „Nicht jetzt“ bleibt möglich.
- App-Icon/Splash, Datenschutz-/Supportpfad und gestaffelten Release vorbereiten.
- Push erst nach Entscheidung für das Apple Developer Program aktivieren.

## Architekturleitplanken

1. Offline bleibt ein Produktversprechen: Neues Logging hat einen Queue-/Cache-Pfad oder eine sichtbare Einschränkung.
2. Regeln vor LLM: Progression, Warm-ups und Deloads bleiben deterministisch, versioniert und testbar.
3. Kein stilles Automatisieren: Vorschläge ändern Training nur nach ausdrücklicher Nutzeraktion.
4. Mobile zuerst: einhändig, bei schlechtem Netz und ohne modale Unterbrechung.
5. Der Server bleibt die Wahrheit; lokale Daten liefern schnelle Darstellung und werden geordnet synchronisiert.

## Qualitäts-Gates

- `npx tsc --noEmit`, Web-Build und Native-Build vor Abschluss jeder Logging-Initiative.
- Unit-Tests für reine Entscheidungslogik; API-/Queue-Prüfung für Mutationen.
- EN/DE, Dark Mode, kleine Geräte, Touch-Ziele und Screenreader-Labels prüfen.
- Keine medizinischen Diagnosen oder Heilversprechen; Trainingshinweise bleiben Trainingshinweise.
