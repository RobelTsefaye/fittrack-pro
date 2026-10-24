import { describe, expect, it } from "vitest";
import { applyOverrides, type CalendarEntry } from "../schedule";

const entry = (date: string): CalendarEntry => ({
  date,
  sourceDate: date,
  title: "Push",
  notes: null,
  startMinutes: 1080,
  durationMinutes: 90,
});
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("applyOverrides", () => {
  it("drops skipped days and applies moves/time/duration overrides", () => {
    const result = applyOverrides(
      [entry("2026-02-02"), entry("2026-02-04"), entry("2026-02-06")],
      [
        { date: d("2026-02-02"), skip: true, movedToDate: null, timeMinutes: null, durationMinutes: null },
        { date: d("2026-02-04"), skip: false, movedToDate: d("2026-02-05"), timeMinutes: 420, durationMinutes: 60 },
      ]
    );
    expect(result).toEqual([
      { ...entry("2026-02-04"), date: "2026-02-05", startMinutes: 420, durationMinutes: 60 },
      entry("2026-02-06"),
    ]);
  });
});
