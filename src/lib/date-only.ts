export class InvalidDateError extends Error {
  constructor(input: string) {
    super(`Invalid date: ${JSON.stringify(input)}`);
    this.name = "InvalidDateError";
  }
}

/** Parse `YYYY-MM-DD` as UTC calendar date (matches `@db.Date` storage). */
export function parseDateOnlyUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) throw new InvalidDateError(iso);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Date.UTC silently rolls over (2024-02-30 → 2024-03-01); reject instead.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new InvalidDateError(iso);
  }
  return date;
}

export function formatDateOnlyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Local calendar date as `YYYY-MM-DD` for form defaults. */
export function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
