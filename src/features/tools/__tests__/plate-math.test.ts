import { describe, expect, it } from "vitest";
import { calcPlates, perSideSummary } from "../plate-math";

const kg = [25, 20, 15, 10, 5, 2.5, 1.25].map((weight) => ({ weight }));

describe("calcPlates", () => {
  it("breaks a target into per-side plates", () => {
    const r = calcPlates(100, 20, kg);
    expect(r.type).toBe("plates");
    if (r.type === "plates") {
      expect(r.plates.map((p) => [p.spec.weight, p.count])).toEqual([[25, 1], [15, 1]]);
      expect(r.total).toBe(100);
    }
  });

  it("handles bar-only, empty and unreachable targets", () => {
    expect(calcPlates(20, 20, kg).type).toBe("bar-only");
    expect(calcPlates(0, 20, kg).type).toBe("empty");
    expect(calcPlates(101, 20, kg)).toEqual({ type: "not-achievable", nearest: 100 });
  });
});

describe("perSideSummary", () => {
  it("lists plates per side", () => {
    expect(perSideSummary(140, "KG")).toMatch(/^25 \+ 25 \+ 10$/);
    expect(perSideSummary(20, "KG")).toBeNull();
  });
});
