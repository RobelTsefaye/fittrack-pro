import { describe, expect, it } from "vitest";
import { formatDateOnlyUtc, parseDateOnlyUtc } from "@/lib/date-only";

describe("parseDateOnlyUtc", () => {
  it("parses YYYY-MM-DD as a UTC calendar date", () => {
    const d = parseDateOnlyUtc("2024-02-29");
    expect(d.toISOString()).toBe("2024-02-29T00:00:00.000Z");
    expect(formatDateOnlyUtc(d)).toBe("2024-02-29");
  });

  it.each(["", "abc", "2024-01", "2024-13-01", "2024-02-30", "2023-02-29", "2024-1-1x"])(
    "rejects %j",
    (input) => {
      expect(() => parseDateOnlyUtc(input)).toThrow();
    }
  );
});

describe("isValidDateOnly / dateOnlySchema", () => {
  it("accepts real calendar dates only", async () => {
    const { isValidDateOnly, dateOnlySchema } = await import("@/lib/date-only");
    expect(isValidDateOnly("2024-02-29")).toBe(true);
    expect(isValidDateOnly("2024-02-30")).toBe(false);
    expect(isValidDateOnly("2024-2-3")).toBe(false);
    expect(dateOnlySchema.safeParse("2023-02-29").success).toBe(false);
  });
});
