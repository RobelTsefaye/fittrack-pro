import { describe, expect, it } from "vitest";
import { macrosFromBodyWeight } from "../nutrition-config";

describe("macrosFromBodyWeight", () => {
  it("scales protein/fat to body weight and fills carbs", () => {
    // 80 kg: 160 g protein (640 kcal), 72 g fat (648 kcal) → (2200-1288)/4 = 228 g carbs
    expect(macrosFromBodyWeight(80, 2200)).toEqual({ protein: 160, fat: 72, carbs: 228 });
  });
  it("never returns negative carbs", () => {
    expect(macrosFromBodyWeight(150, 1500).carbs).toBe(0);
  });
});
