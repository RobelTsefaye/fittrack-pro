/**
 * Einfaches In-Memory-Rate-Limit (Fixed Window pro Schlüssel) für die Auth-Wege.
 *
 * Grenzen: Der Zähler lebt nur im Prozess (Neustart = leer, mehrere Instanzen = getrennt).
 * Für den Ein-Host-Betrieb (selfhost.sh) reicht das. Hinter dem Tailscale Funnel kann die
 * Client-IP für alle Anfragen gleich sein; dann teilen sich alle einen Zähler.
 */

export type RateLimiter = {
  /** Zählt einen Versuch. `ok: false` heisst: Limit überschritten, `retryAfterSec` abwarten. */
  hit(key: string): { ok: boolean; retryAfterSec: number };
  /** Setzt den Zähler eines Schlüssels zurück (z. B. nach erfolgreichem Login). */
  reset(key: string): void;
};

type Options = {
  windowMs: number;
  max: number;
  /** Obergrenze für die Map-Grösse; darüber werden die ältesten Einträge verdrängt. */
  maxKeys?: number;
  now?: () => number;
};

export function createRateLimiter({
  windowMs,
  max,
  maxKeys = 5000,
  now = Date.now,
}: Options): RateLimiter {
  // Map behält die Einfügereihenfolge: ältester Eintrag zuerst.
  const entries = new Map<string, { count: number; resetAt: number }>();

  function sweep(t: number) {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= t) entries.delete(key);
    }
    while (entries.size >= maxKeys) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  }

  return {
    hit(key) {
      const t = now();
      let entry = entries.get(key);
      if (!entry || entry.resetAt <= t) {
        if (!entry && entries.size >= maxKeys) sweep(t);
        entry = { count: 0, resetAt: t + windowMs };
        entries.delete(key);
        entries.set(key, entry);
      }
      entry.count += 1;
      if (entry.count > max) {
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - t) / 1000)) };
      }
      return { ok: true, retryAfterSec: 0 };
    },
    reset(key) {
      entries.delete(key);
    },
  };
}

/** Client-IP aus `x-forwarded-for` (erster Eintrag) bzw. `x-real-ip`, sonst "unknown". */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded.slice(0, 64);
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  return "unknown";
}
