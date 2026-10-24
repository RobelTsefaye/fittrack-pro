import { describe, expect, it } from "vitest";
import { withSevenDayAverage } from "../weight-average";

describe("withSevenDayAverage", () => {
  it("averages the trailing 7 days including the day itself", () => {
    const out = withSevenDayAverage([
      { date: "2026-10-01", weight: 80 },
      { date: "2026-10-04", weight: 81 },
      { date: "2026-10-07", weight: 82 },
      { date: "2026-10-08", weight: 83 },
    ]);
    expect(out.map((p) => p.avg7)).toEqual([80, 80.5, 81, 82]);
  });

  it("handles empty input", () => {
    expect(withSevenDayAverage([])).toEqual([]);
  });
});
