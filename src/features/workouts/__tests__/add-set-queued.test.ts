import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Review B-1: nach `queued` darf addSet keinen Fehler-Toast zeigen (der Satz ist lokal
 * schon angelegt; ein Toast verleitet zum Doppel-Tippen). Quelltext-Test, weil die
 * Komponente nicht ohne grossen Umbau isoliert renderbar ist.
 */
describe("workout-detail addSet", () => {
  const src = readFileSync(
    join(process.cwd(), "src/features/workouts/components/workout-detail.tsx"),
    "utf8"
  );

  it("kehrt bei queued zurueck, bevor der saveFailed-Toast kommt", () => {
    const start = src.indexOf(
      "CREATE_WRITE\n    );",
      src.indexOf("() => addSet(weId, isWarmup, true)")
    );
    expect(start).toBeGreaterThan(0);
    const block = src.slice(start, start + 600);
    const queuedAt = block.indexOf('outcome.kind === "queued"');
    const toastAt = block.indexOf('toast.error(t("common.saveFailed"))');
    expect(queuedAt).toBeGreaterThan(-1);
    expect(toastAt).toBeGreaterThan(queuedAt);
    expect(block).not.toContain('outcome.kind !== "response"');
  });
});
