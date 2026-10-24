import { describe, expect, it } from "vitest";
import { kgToLb, lbToKg } from "@/lib/units";
import { epley1RM } from "@/lib/strength";

describe("unit conversion", () => {
  it("round-trips kg <-> lb", () => {
    expect(lbToKg(100)).toBeCloseTo(45.359237);
    expect(kgToLb(lbToKg(225))).toBeCloseTo(225);
  });
});

describe("epley1RM", () => {
  it("estimates 1RM", () => {
    expect(epley1RM(100, 1)).toBeCloseTo(103.333, 2);
    expect(epley1RM(100, 10)).toBeCloseTo(133.333, 2);
  });
  it("returns 0 for invalid sets", () => {
    expect(epley1RM(100, 0)).toBe(0);
    expect(epley1RM(0, 5)).toBe(0);
  });
});
