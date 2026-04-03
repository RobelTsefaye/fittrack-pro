/** Parse `YYYY-MM-DD` as UTC calendar date (matches `@db.Date` storage). */
export function parseDateOnlyUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) throw new Error("Invalid date");
  return new Date(Date.UTC(y, m - 1, d));
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
