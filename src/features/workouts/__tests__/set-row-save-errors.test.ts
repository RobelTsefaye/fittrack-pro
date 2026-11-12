import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FT-ERR-01: Satz-Speicherpfad in set-row.tsx. Quelltext-Test, weil die Komponente
 * ohne grossen Umbau nicht isoliert renderbar ist (Testumgebung: node).
 */
const src = readFileSync(
  join(process.cwd(), "src/features/workouts/components/set-row.tsx"),
  "utf8"
);
const persist = src.slice(
  src.indexOf("async function persistSet"),
  src.indexOf("async function deleteSet")
);
const del = src.slice(src.indexOf("async function deleteSet"), src.indexOf("const inputClass"));
const TOAST = 'toast.error(t("common.saveFailed"), { id: SAVE_FAILED_TOAST_ID })';

describe("set-row persistSet (FT-ERR-01)", () => {
  it("queued kehrt ohne Fehler-Toast zurueck (B3-Queue-Logik)", () => {
    const q = persist.indexOf('outcome.kind === "queued"');
    const f = persist.indexOf('outcome.kind === "failed"');
    expect(q).toBeGreaterThan(-1);
    expect(f).toBeGreaterThan(q);
    const queuedBlock = persist.slice(q, f);
    expect(queuedBlock).not.toContain("toast.error");
    expect(queuedBlock).toContain("return;");
  });

  it("failed und Nicht-OK-Antwort zeigen den Fehler-Toast", () => {
    expect(persist.match(/toast\.error\(t\("common\.saveFailed"\)/g)?.length).toBe(2);
    expect(persist).toContain(TOAST);
    // failed: nicht mehr nur bei complete/queueFallback
    expect(persist).not.toContain("if (complete || queueFallback) toast.error");
  });

  it("Fehler laden den Serverstand nicht neu (getippte Werte bleiben)", () => {
    expect(persist).not.toContain("onRefresh");
  });

  it("writeOrQueue bleibt mit Queue-Fallback verdrahtet, kein eigenes Timeout", () => {
    expect(persist).toContain(
      "queueFallback ? () => queueFallback.patchSet(data, complete) : undefined"
    );
    expect(persist).not.toContain("setTimeout");
  });

  it("unerwartete Fehler (z. B. res.json) werden in saveSet gefangen und gemeldet", () => {
    const saveSet = src.slice(
      src.indexOf("async function saveSet"),
      src.indexOf("async function persistSet")
    );
    expect(saveSet).toContain("await persistSet(");
    expect(saveSet).toContain("} catch {");
    expect(saveSet).toContain(TOAST);
  });
});

describe("set-row deleteSet (FT-ERR-01)", () => {
  it("meldet failed und Nicht-OK, queued bleibt still", () => {
    expect(del.match(/toast\.error\(t\("common\.saveFailed"\)/g)?.length).toBe(2);
    const q = del.indexOf('outcome.kind === "queued"');
    expect(del.slice(q, q + 60)).not.toContain("toast");
  });
});

describe("i18n", () => {
  it.each(["de", "en"])("common.saveFailed existiert in %s.json", (l) => {
    const m = JSON.parse(readFileSync(join(process.cwd(), `src/messages/${l}.json`), "utf8"));
    expect(typeof m.common.saveFailed).toBe("string");
  });
});
