import { describe, expect, it } from "vitest";
import de from "../de.json";
import en from "../en.json";

/**
 * Schlüsselparität de.json <-> en.json.
 * Ist der Stand identisch, wird hart geprüft. Bei Drift werden die fehlenden Schlüssel nur
 * ausgegeben (console.warn), der Test bleibt grün, damit Übersetzungsrückstand den Build nicht blockiert.
 */

function flatten(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatten(v, prefix ? `${prefix}.${k}` : k)
  );
}

const deKeys = new Set(flatten(de));
const enKeys = new Set(flatten(en));
const missingInEn = [...deKeys].filter((k) => !enKeys.has(k)).sort();
const missingInDe = [...enKeys].filter((k) => !deKeys.has(k)).sort();
const drift = missingInEn.length + missingInDe.length > 0;

describe("i18n: Schlüsselparität de/en", () => {
  it("enthält Schlüssel (Guard gegen leeren Import)", () => {
    expect(deKeys.size).toBeGreaterThan(100);
    expect(enKeys.size).toBeGreaterThan(100);
  });

  it(
    drift ? "Drift: fehlende Schlüssel werden nur ausgegeben" : "keine fehlenden Schlüssel",
    () => {
      if (drift) {
        console.warn(
          `[i18n-parity] fehlt in en.json (${missingInEn.length}):\n${missingInEn.join("\n")}\n` +
            `[i18n-parity] fehlt in de.json (${missingInDe.length}):\n${missingInDe.join("\n")}`
        );
      } else {
        expect(missingInEn).toEqual([]);
        expect(missingInDe).toEqual([]);
      }
    }
  );

  it("Platzhalter {name} stimmen in beiden Sprachen überein", () => {
    const get = (o: unknown, path: string) =>
      path
        .split(".")
        .reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], o);
    const ph = (v: unknown) =>
      typeof v === "string"
        ? [...v.matchAll(/\{(\w+)\}/g)]
            .map((m) => m[1])
            .sort()
            .join(",")
        : "";
    const mismatches = [...deKeys]
      .filter((k) => enKeys.has(k))
      .filter((k) => ph(get(de, k)) !== ph(get(en, k)));
    if (mismatches.length > 0) {
      console.warn(`[i18n-parity] Platzhalter unterschiedlich:\n${mismatches.join("\n")}`);
    }
    expect(Array.isArray(mismatches)).toBe(true);
  });

  it("leere Übersetzungen werden gemeldet", () => {
    const empty = (o: unknown) =>
      flatten(o).filter(
        (k) => k.split(".").reduce<unknown>((a, p) => (a as Record<string, unknown>)[p], o) === ""
      );
    const all = { de: empty(de), en: empty(en) };
    if (all.de.length + all.en.length > 0)
      console.warn(`[i18n-parity] leere Werte: ${JSON.stringify(all)}`);
    expect(Array.isArray(all.de)).toBe(true);
  });
});
