import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InvalidDateError,
  dateOnlySchema,
  formatDateOnlyUtc,
  isValidDateOnly,
  parseDateOnlyUtc,
  todayLocalISO,
} from "@/lib/date-only";
import { clamp, linearSlope, median } from "@/lib/trend-math";
import { epley1RM } from "@/lib/strength";
import { kgToLb, lbToKg } from "@/lib/units";

/** Ergänzt Lücken der bestehenden date-only-/trend-math-/units-strength-Tests (Characterization). */

describe("date-only: Lücken", () => {
  it("InvalidDateError trägt Name und die Eingabe in der Meldung", () => {
    try {
      parseDateOnlyUtc("2024-02-30");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidDateError);
      expect((e as Error).name).toBe("InvalidDateError");
      expect((e as Error).message).toBe('Invalid date: "2024-02-30"');
    }
  });

  it("Schaltjahr-Grenzen: 1900 kein, 2000 ein Schaltjahr", () => {
    expect(isValidDateOnly("1900-02-29")).toBe(false);
    expect(isValidDateOnly("2000-02-29")).toBe(true);
    expect(isValidDateOnly("2024-04-31")).toBe(false);
    expect(isValidDateOnly("2024-12-31")).toBe(true);
  });

  it("isValidDateOnly ist strikter als parseDateOnlyUtc (IST: Parser akzeptiert '2024-1-1')", () => {
    expect(parseDateOnlyUtc("2024-1-1").toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(isValidDateOnly("2024-1-1")).toBe(false);
  });

  it("lehnt Jahr 0 und ISO-Zeitstempel ab", () => {
    expect(() => parseDateOnlyUtc("0000-01-01")).toThrow(InvalidDateError);
    expect(() => parseDateOnlyUtc("2024-01-01T10:00:00Z")).toThrow(InvalidDateError);
    expect(isValidDateOnly("2024-01-01T10:00:00Z")).toBe(false);
    expect(isValidDateOnly(" 2024-01-01")).toBe(false);
  });

  it("dateOnlySchema liefert 'Use YYYY-MM-DD' und lehnt Nicht-Strings ab", () => {
    const bad = dateOnlySchema.safeParse("2024/01/01");
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].message).toBe("Use YYYY-MM-DD");
    expect(dateOnlySchema.safeParse(20240101).success).toBe(false);
    expect(dateOnlySchema.safeParse(null).success).toBe(false);
  });

  it("formatDateOnlyUtc nutzt UTC unabhängig von der Uhrzeit", () => {
    expect(formatDateOnlyUtc(new Date("2024-03-10T23:59:59.999Z"))).toBe("2024-03-10");
    expect(formatDateOnlyUtc(new Date("2024-03-11T00:00:00.000Z"))).toBe("2024-03-11");
  });

  describe("todayLocalISO", () => {
    afterEach(() => vi.useRealTimers());
    it("formatiert das lokale Datum mit führenden Nullen", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2024, 0, 5, 12, 0, 0)); // lokale Zeit
      expect(todayLocalISO()).toBe("2024-01-05");
    });
  });
});

describe("trend-math: Lücken", () => {
  it("median: ein Element, Duplikate, negative Werte", () => {
    expect(median([7])).toBe(7);
    expect(median([2, 2, 2, 9])).toBe(2);
    expect(median([-3, -1, -2])).toBe(-2);
  });

  it("median sortiert numerisch (nicht lexikografisch)", () => {
    expect(median([10, 9, 1])).toBe(9);
  });

  it("linearSlope: fallende Reihe, Offset-Invarianz, Rauschen", () => {
    expect(linearSlope([7, 5, 3, 1])).toBeCloseTo(-2);
    expect(linearSlope([100, 101, 102])).toBeCloseTo(linearSlope([0, 1, 2]));
    expect(linearSlope([0, 2, 1, 3])).toBeGreaterThan(0);
  });

  it("linearSlope: NaN in der Reihe propagiert (IST, keine Filterung)", () => {
    expect(linearSlope([1, Number.NaN, 3])).toBeNaN();
  });

  it("clamp: Randwerte und IST bei vertauschten Grenzen (min > max liefert min)", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
    expect(clamp(5, 10, 0)).toBe(10);
  });
});

describe("strength/units: Lücken", () => {
  it("epley1RM: negative Reps, negatives Gewicht, Bruchteil-Reps < 1", () => {
    expect(epley1RM(100, -2)).toBe(0);
    expect(epley1RM(-50, 5)).toBe(0);
    expect(epley1RM(100, 0.5)).toBe(0);
  });

  it("epley1RM: Reps werden nicht gedeckelt (IST: 999 Reps -> 33x Gewicht)", () => {
    expect(epley1RM(10, 999)).toBeCloseTo(10 * (1 + 999 / 30));
  });

  it("Einheiten: 0, negative Werte, bekannte Referenzwerte", () => {
    expect(lbToKg(0)).toBe(0);
    expect(kgToLb(0)).toBe(0);
    expect(lbToKg(-10)).toBeCloseTo(-4.5359237);
    expect(kgToLb(1)).toBeCloseTo(2.2046226, 6);
    expect(lbToKg(2.20462262185)).toBeCloseTo(1, 6);
  });
});
