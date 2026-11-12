import { describe, it } from "vitest";

/**
 * Reproduktions-Platzhalter zu docs/audit/KNOWN-BUGS.md. Nur dort ein Test, wo sich ein konkreter
 * Code-Pfad ohne Browser/DB/Gerät belegen lässt (siehe stattdessen:
 * - KB-11: src/lib/offline/__tests__/flush-*.test.ts
 * - KB-I:  src/app/api/health-data/__tests__/route.test.ts).
 */
describe("KNOWN-BUGS Reproduktionen (offen)", () => {
  it.todo(
    "KB-09: Workout-Logging hängt/langsam - Verdacht workout-detail.tsx (~2260 Zeilen, React-Rendering); braucht jsdom/Browser-Profiling, in der Node-Vitest-Umgebung ohne neue Abhängigkeiten nicht testbar"
  );
  it.todo(
    "KB-10: Cardio-Uhr hängt/Absturz - Ursache laut KB-J im nie kompilierten Swift/Watch-Code; serverseitig (cardio/live, SSE-Stream) kein konkreter Fehlerpfad erkennbar, nicht ohne Gerät reproduzierbar"
  );
});
