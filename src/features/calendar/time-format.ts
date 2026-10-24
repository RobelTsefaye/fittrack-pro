/** Minutes after midnight → `HH:MM`. */
export function minutesToHhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** `HH:MM` → minutes after midnight, or null when unparsable. */
export function hhmmToMinutes(value: string): number | null {
  const [hours, minutes] = value.split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours! * 60 + minutes! : null;
}
