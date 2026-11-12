import { describe, expect, it, vi } from "vitest";

/** FT-TEST-05: Fixtures für die reine Bewertung `scoreFromData` (recovery.ts). Prisma wird nur gemockt, damit der Import lädt. */
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { scoreFromData } = await import("../recovery");

const DAY = 86_400_000;
const AS_OF = Date.UTC(2026, 2, 20, 12); // 2026-03-20 12:00 UTC

type Snap = Parameters<typeof scoreFromData>[1][number];

/** Tagesnapshot `ago` Tage vor AS_OF; Standardwerte = unauffälliger Athlet. */
function snap(ago: number, over: Partial<Snap> = {}): Snap {
  return {
    date: new Date(Math.floor(AS_OF / DAY) * DAY - ago * DAY),
    sleepDuration: 8,
    sleepQuality: null,
    sleepDeepMinutes: null,
    sleepRemMinutes: null,
    restingHeartRate: 55,
    hrv: 60,
    respiratoryRate: 14,
    wristTemperature: 36.5,
    steps: 9000,
    activeCalories: 500,
    ...over,
  };
}

/** `n` Tage Historie, älteste zuerst, heute (ago=0) zuletzt. */
const history = (n: number, todayOver: Partial<Snap> = {}): Snap[] =>
  Array.from({ length: n }, (_, i) => {
    const ago = n - 1 - i;
    return snap(ago, ago === 0 ? todayOver : {});
  });

const workout = (hoursAgo: number, tonnage: number | null = 10000) => ({
  completedAt: new Date(AS_OF - hoursAgo * 3_600_000),
  tonnage,
});

describe("scoreFromData", () => {
  it("XR-API-03 (IST): ohne Snapshots liefert die Bewertung score 0 / level none (kein null), alle Teilwerte null", () => {
    const r = scoreFromData(AS_OF, [], []);
    expect(r.score).toBe(0);
    expect(r.level).toBe("none");
    expect(r.sleepScore).toBeNull();
    expect(r.loadScore).toBeNull();
    expect(r.baseline.daysOfData).toBe(0);
    expect(r.illnessWarning).toEqual({ active: false, signals: [] });
  });

  it("XR-API-03 (IST): Snapshot ohne Werte und ohne Training ergibt nur Lastanteil 100 -> score 100 / high", () => {
    const empty = snap(0, {
      sleepDuration: null,
      restingHeartRate: null,
      hrv: null,
      respiratoryRate: null,
      wristTemperature: null,
      steps: null,
      activeCalories: null,
    });
    const r = scoreFromData(AS_OF, [empty], []);
    expect(r.loadScore).toBe(100);
    expect(r.sleepScore).toBeNull();
    expect(r.score).toBe(100);
    expect(r.level).toBe("high");
  });

  it("unauffällige 15 Tage, kein Training: hoher Score, Baselines gesetzt, keine Warnung", () => {
    const r = scoreFromData(AS_OF, history(15), []);
    expect(r.level).toBe("high");
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.baseline.restingHR).toBe(55);
    expect(r.baseline.hrv).toBe(60);
    expect(r.baseline.hrDays).toBe(15);
    expect(r.sleepScore).toBe(100);
    expect(r.trends).toEqual({ hrTrend: "stable", hrvTrend: "stable" });
    expect(r.vitals.penalty).toBe(0);
    expect(r.illnessWarning.active).toBe(false);
    expect(r.trainingLoad.daysSinceLast).toBeNull();
  });

  it("weniger als 7 Tage HR/HRV: keine Baseline (null), Score trotzdem berechnet", () => {
    const r = scoreFromData(AS_OF, history(5), []);
    expect(r.baseline.restingHR).toBeNull();
    expect(r.baseline.hrv).toBeNull();
    expect(r.hrScore).not.toBeNull();
    expect(r.score).toBeGreaterThan(0);
  });

  it("veralteter letzter Snapshot (3 Tage alt): Schlaf/HR/HRV zählen als keine Daten, Score nur aus Last", () => {
    const old = history(15).map((s) => ({ ...s, date: new Date(s.date.getTime() - 3 * DAY) }));
    const r = scoreFromData(AS_OF, old, []);
    expect(r.sleepScore).toBeNull();
    expect(r.hrScore).toBeNull();
    expect(r.hrvScore).toBeNull();
    expect(r.trends).toEqual({ hrTrend: null, hrvTrend: null });
    expect(r.loadScore).toBe(100);
  });

  it("Snapshots nach dem Stichtag werden ignoriert", () => {
    const future = snap(-2, { restingHeartRate: 99 });
    const withFuture = scoreFromData(AS_OF, [...history(15), future], []);
    const without = scoreFromData(AS_OF, history(15), []);
    expect(withFuture).toEqual(without);
  });

  it("Einzelne Einheit heute bei dünner Historie (IST): daysSinceLast 0, aber Lastscore 100, Score unverändert (Sparse-Data-Fallback)", () => {
    const base = scoreFromData(AS_OF, history(15), []);
    const r = scoreFromData(AS_OF, history(15), [workout(2)]);
    expect(r.trainingLoad.daysSinceLast).toBe(0);
    expect(r.trainingLoad.consecutiveDays).toBe(1);
    expect(r.loadScore).toBe(100);
    expect(r.score).toBe(base.score);
  });

  it("Lastspitze nach regelmäßigem Training (Tonnage x5 in der Akutwoche): Lastscore sinkt, Score sinkt", () => {
    const regular = [27, 24, 21, 18, 15, 12, 9].map((d) => workout(d * 24, 10000));
    const base = scoreFromData(AS_OF, history(29), regular);
    const spike = scoreFromData(AS_OF, history(29), [
      ...regular,
      workout(2, 50000),
      workout(26, 50000),
    ]);
    expect(spike.trainingLoad.acwr!).toBeGreaterThan(base.trainingLoad.acwr!);
    expect(spike.loadScore!).toBeLessThan(base.loadScore!);
    expect(spike.score).toBeLessThan(base.score);
  });

  it("Training an drei aufeinanderfolgenden Tagen: consecutiveDays 3", () => {
    const r = scoreFromData(AS_OF, history(15), [workout(2), workout(26), workout(50)]);
    expect(r.trainingLoad.consecutiveDays).toBe(3);
  });

  it("Cardio ohne Kraft zählt für daysSinceLast", () => {
    const r = scoreFromData(AS_OF, history(15), [], [workout(30, 3600)]);
    expect(r.trainingLoad.daysSinceLast).toBe(1);
  });

  it("Training älter als 28 Tage bleibt unberücksichtigt", () => {
    const r = scoreFromData(AS_OF, history(15), [workout(24 * 40)]);
    expect(r.trainingLoad.daysSinceLast).toBeNull();
    expect(r.loadScore).toBe(100);
  });

  it("schlechter Schlaf (4 h) senkt den Schlafscore stark", () => {
    const r = scoreFromData(AS_OF, history(15, { sleepDuration: 4 }), []);
    expect(r.sleepScore).toBe(10);
    expect(r.score).toBeLessThan(scoreFromData(AS_OF, history(15), []).score);
  });

  it("Ruhepuls +12 % und HRV -25 % gegenüber der Baseline: HR-/HRV-Score fallen, Warnung nur mit Vitalmarker", () => {
    const r = scoreFromData(AS_OF, history(15, { restingHeartRate: 62, hrv: 45 }), []);
    expect(r.hrScore!).toBeLessThan(60);
    expect(r.hrvScore!).toBeLessThan(60);
    expect(r.illnessWarning.signals).toEqual(expect.arrayContaining(["hrv", "restingHR"]));
    expect(r.illnessWarning.active).toBe(false); // HRV+Puls allein = Ermüdung, keine Krankheit
  });

  it("Krankheitswarnung: erhöhte Temperatur + Atemfrequenz + HRV-Abfall, Penalty > 0 und im Score berücksichtigt", () => {
    const sick = scoreFromData(
      AS_OF,
      history(15, { wristTemperature: 37.2, respiratoryRate: 16, hrv: 48 }),
      []
    );
    expect(sick.illnessWarning.active).toBe(true);
    expect(sick.illnessWarning.signals).toEqual(
      expect.arrayContaining(["temp", "respiratory", "hrv"])
    );
    expect(sick.vitals.penalty).toBeGreaterThan(0);
    expect(sick.vitals.tempDelta).toBeCloseTo(0.7, 5);
    expect(sick.score).toBeLessThan(scoreFromData(AS_OF, history(15), []).score);
  });

  it("nur Temperatur erhöht (ein Signal): Warnung nicht aktiv", () => {
    const r = scoreFromData(AS_OF, history(15, { wristTemperature: 37.1 }), []);
    expect(r.illnessWarning).toEqual({ active: false, signals: ["temp"] });
  });

  it("Score bleibt in 0..100 und level folgt den Schwellen (>=75 high, >=50 mid, sonst low)", () => {
    const cases = [
      scoreFromData(AS_OF, history(15), []),
      scoreFromData(AS_OF, history(15, { sleepDuration: 3, restingHeartRate: 80, hrv: 20 }), [
        workout(2),
        workout(26),
        workout(50),
      ]),
    ];
    for (const r of cases) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.level).toBe(r.score >= 75 ? "high" : r.score >= 50 ? "mid" : "low");
    }
  });
});
