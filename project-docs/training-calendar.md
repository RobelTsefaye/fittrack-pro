# Trainingstage im iOS-Kalender

Aktivierte Trainingstage und Uhrzeit werden in `UserSettings` gespeichert. Die iOS-App erstellt dafür in einem eigenen **FitTrack Pro**-Kalender rollierend Events für die nächsten 28 Tage. Der erste Eintrag liegt immer morgen; die Titel folgen der bestehenden Plan-Rotation. Cardio verwendet unabhängig davon **FitTrack Pro Cardio**, eigene Tage, Uhrzeit, Dauer und ein globales Aktivitäts-Label.

Architektur: `GET /api/calendar/schedule` liefert den Zeitplan, `src/lib/native/calendar.ts` fordert Zugriff an und ruft `EventKitPlugin` auf. Der Sync läuft beim Start/Resume, nach dem Speichern der Einstellungen und nach einem Online-Workout-Abschluss.

Pro-Tag-Änderungen werden als `CalendarOverride` in der Datenbank gespeichert, nicht als EventKit-Änderungen. Beim Sync werden alle zukünftigen Events des App-Kalenders neu erzeugt: Overrides können auslassen, auf ein Datum verschieben sowie Zeit oder Dauer ersetzen. Das Label bleibt global, und die Gym-Rotation bleibt positionsbasiert. Manuelle Änderungen in der Kalender-App werden beim nächsten Sync ersetzt. Plan-Änderungen erscheinen erst beim nächsten Resume oder Settings-Save. Es gibt keine Alarme oder bidirektionale Synchronisierung.

## On-Device-Testcheckliste

1. API und Migration produktiv deployen.
2. In Xcode bauen und auf einem Gerät starten.
3. Kalenderzugriff beim Aktivieren gewähren.
4. Beide Kalender, ihre Uhrzeiten/Dauern und die 28-Tage-Rotation prüfen.
5. App mehrfach in den Hintergrund und zurück holen: keine Duplikate.
6. Online-Workout abschließen: zukünftige Titel rotieren weiter.
7. Toggle deaktivieren: zukünftige Events verschwinden, vergangene bleiben.
8. Zugriff verweigern und später in iOS erlauben sowie Web-Änderungen beim nächsten App-Start prüfen.
9. Im Editor einen Tag auslassen, verschieben sowie Zeit und Dauer ändern; nach Sync die regenerierten Events prüfen.
