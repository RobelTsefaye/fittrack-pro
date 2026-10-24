import { describe, expect, it } from "vitest";
import { hhmmToMinutes, minutesToHhmm } from "../time-format";

describe("time-format", () => {
  it("round-trips HH:MM", () => {
    expect(minutesToHhmm(0)).toBe("00:00");
    expect(minutesToHhmm(1080)).toBe("18:00");
    expect(hhmmToMinutes("07:05")).toBe(425);
    expect(hhmmToMinutes("")).toBeNull();
  });
});
