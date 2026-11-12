import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import de from "@/messages/de.json";
import en from "@/messages/en.json";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("Fehlerseiten (FT-ERR-03)", () => {
  const files = ["error.tsx", "global-error.tsx", "not-found.tsx", "(app)/error.tsx"];

  it.each(files)("%s existiert", (f) => {
    expect(existsSync(join(root, f))).toBe(true);
  });

  it.each(["error.tsx", "global-error.tsx", "(app)/error.tsx"])(
    "%s ist Client Component, nutzt unstable_retry und loggt",
    (f) => {
      const src = read(f);
      expect(src.startsWith('"use client"')).toBe(true);
      expect(src).toContain("unstable_retry");
    }
  );

  it("global-error rendert eigenes html/body und loggt per console.error", () => {
    const src = read("global-error.tsx");
    expect(src).toContain("<html");
    expect(src).toContain("<body");
    expect(src).toContain("console.error(error)");
  });

  it("gemeinsame Ansicht loggt und zeigt keine Fehlerdetails", () => {
    const src = readFileSync(join(root, "../components/error-view.tsx"), "utf8");
    expect(src).toContain("console.error(error)");
    expect(src).not.toContain("error.message");
    expect(src).not.toContain("error.stack");
  });

  it("Texte existieren in de und en und sind nicht leer", () => {
    const keys = Object.keys(en.errorPage).sort();
    expect(Object.keys(de.errorPage).sort()).toEqual(keys);
    for (const k of keys) {
      expect((en.errorPage as Record<string, string>)[k]).not.toBe("");
      expect((de.errorPage as Record<string, string>)[k]).not.toBe("");
    }
  });
});
