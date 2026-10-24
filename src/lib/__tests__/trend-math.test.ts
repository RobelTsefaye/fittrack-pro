import { describe, expect, it } from "vitest";
import { clamp, linearSlope, median } from "@/lib/trend-math";

describe("median", () => {
  it("returns null for empty input", () => {
    expect(median([])).toBeNull();
  });
  it("handles odd and even lengths without mutating input", () => {
    const values = [3, 1, 2];
    expect(median(values)).toBe(2);
    expect(values).toEqual([3, 1, 2]);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("linearSlope", () => {
  it("is 0 for fewer than two points", () => {
    expect(linearSlope([])).toBe(0);
    expect(linearSlope([5])).toBe(0);
  });
  it("matches the slope of a perfect line", () => {
    expect(linearSlope([1, 3, 5, 7])).toBeCloseTo(2);
    expect(linearSlope([10, 10, 10])).toBe(0);
  });
});

describe("clamp", () => {
  it("bounds values on both sides", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
