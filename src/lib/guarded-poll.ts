/**
 * Poll-Tick mit In-Flight-Guard und Timeout (FT-ARCH-08).
 *
 * - Läuft der vorige Tick noch, startet ein neuer Tick keinen weiteren Request.
 * - Nach `timeoutMs` wird der `AbortSignal` ausgelöst und der Guard freigegeben,
 *   auch wenn die Aufgabe das Signal ignoriert (z. B. hängende native Bridge).
 * - Ein Abbruch durch das Timeout ist kein Fehler; Fehler der Aufgabe werden
 *   verschluckt (der Aufrufer behandelt eigene Fehler selbst).
 */
export const POLL_TIMEOUT_MS = 10_000;

export function createGuardedPoll(
  task: (signal: AbortSignal) => Promise<unknown>,
  timeoutMs: number = POLL_TIMEOUT_MS
): () => Promise<boolean> {
  let inFlight = false;

  /** Gibt `true` zurück, wenn ein Lauf gestartet wurde, `false` wenn übersprungen. */
  return async function tick(): Promise<boolean> {
    if (inFlight) return false;
    inFlight = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve();
      }, timeoutMs);
    });
    try {
      await Promise.race([task(controller.signal), timedOut]);
    } catch {
      // Abgebrochene oder fehlgeschlagene Polls lösen hier nichts aus.
    } finally {
      clearTimeout(timer);
      inFlight = false;
    }
    return true;
  };
}
