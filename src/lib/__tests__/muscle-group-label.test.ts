import { describe, expect, it } from "vitest";
import { muscleGroupLabel, titleCaseEnum } from "@/lib/muscle-group-label";

describe("muscleGroupLabel", () => {
  const t = (key: string) => ({ "muscleMap.CHEST": "Brust" })[key] ?? key;

  it("uses the translation when present, else a title-cased fallback", () => {
    expect(muscleGroupLabel(t, "CHEST")).toBe("Brust");
    expect(muscleGroupLabel(t, "FULL_BODY")).toBe("Full Body");
    expect(titleCaseEnum("BARBELL")).toBe("Barbell");
  });
});
