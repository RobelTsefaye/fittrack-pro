import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as C from "../fittrack-api";

/**
 * Die Fixtures in `../fixtures` sind die Quelle für `tests/fixtures/fittrack/` im Nexus-Repo
 * (dort als Kopie). Hier: jedes Fixture erfüllt sein Schema, enthält nur Testdaten und keine Secrets.
 */
const dir = join(__dirname, "../fixtures");
const SCHEMA: Record<string, { parse: (x: unknown) => unknown }> = {
  "health.json": C.healthResponse,
  "health-no-data.json": C.healthResponse,
  "training-summary.json": C.trainingSummaryResponse,
  "coach-context.json": C.coachContextResponse,
  "coach-context-empty.json": C.coachContextResponse,
  "workouts.json": C.workoutsResponse,
  "calendar.json": C.calendarResponse,
  "body-weight.json": C.bodyWeightListResponse,
  "export.json": C.exportResponse,
  "error-unauthorized.json": C.errorBody,
};

describe("Fixtures", () => {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

  it("jede Fixture-Datei hat ein Schema und umgekehrt", () => {
    expect(files).toEqual(Object.keys(SCHEMA).sort());
  });

  it.each(files)("%s erfüllt das Vertragsschema", (f) => {
    expect(() => SCHEMA[f]!.parse(JSON.parse(readFileSync(join(dir, f), "utf8")))).not.toThrow();
  });

  it.each(files)("%s enthält keine Zugangsdaten oder echten Adressen", (f) => {
    const text = readFileSync(join(dir, f), "utf8");
    expect(text).not.toMatch(/ftp_[A-Za-z0-9]/);
    expect(text).not.toMatch(/bearer\s/i);
    expect(text).not.toMatch(/@(?!example\.invalid)[a-z0-9-]+\.[a-z]{2,}/i);
    expect(text).not.toMatch(/password|secret|token/i);
  });

  it("Schema lehnt typische Vertragsbrüche ab (Feld umbenannt, Typ gewechselt)", () => {
    const fx = JSON.parse(readFileSync(join(dir, "training-summary.json"), "utf8"));
    const renamed = structuredClone(fx);
    renamed.data.snapshot.done = renamed.data.snapshot.completedThisWeek;
    delete renamed.data.snapshot.completedThisWeek;
    expect(() => C.trainingSummaryResponse.parse(renamed)).toThrow();
    const typed = structuredClone(fx);
    typed.data.snapshot.weeklyGoal = "4";
    expect(() => C.trainingSummaryResponse.parse(typed)).toThrow();
    const kind = structuredClone(fx);
    kind.data.kind = "training-summary";
    expect(() => C.trainingSummaryResponse.parse(kind)).toThrow();
  });
});
