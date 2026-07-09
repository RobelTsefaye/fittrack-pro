/**
 * Heart-rate zone metadata — mirrors HeartRateZones.swift (Watch app
 * target) exactly. The *current* zone during a live cardio session is
 * always computed once, on the Watch (the only device with an actual HR
 * sensor), and pushed to the phone as a plain number — this file only
 * needs the static band definitions (percentages, bpm ranges, labels) to
 * render the zone band UI, never an independent live-zone calculation.
 *
 * Zones follow Apple's own Watch Heart Rate Zones feature: 5 zones as
 * percentage bands of max heart rate (Karvonen-free, the simple
 * 220-minus-age estimate — no resting-HR calibration on file for this
 * user yet).
 */

export const MAX_HEART_RATE = 199; // 220 - 21

export type HeartRateZone = 1 | 2 | 3 | 4 | 5;

export type HeartRateZoneBand = {
  zone: HeartRateZone;
  minPct: number;
  maxPct: number;
  labelDe: string;
};

export const HEART_RATE_ZONE_BANDS: HeartRateZoneBand[] = [
  { zone: 1, minPct: 0.5, maxPct: 0.6, labelDe: "Erholung" },
  { zone: 2, minPct: 0.6, maxPct: 0.7, labelDe: "Fettverbrennung" },
  { zone: 3, minPct: 0.7, maxPct: 0.8, labelDe: "Ausdauer" },
  { zone: 4, minPct: 0.8, maxPct: 0.9, labelDe: "Schwelle" },
  { zone: 5, minPct: 0.9, maxPct: 1.5, labelDe: "Maximal" },
];

export function heartRateZoneBpmRange(zone: HeartRateZone): { min: number; max: number } {
  const band = HEART_RATE_ZONE_BANDS.find((b) => b.zone === zone)!;
  return {
    min: Math.round(band.minPct * MAX_HEART_RATE),
    max: Math.round(Math.min(band.maxPct, 1) * MAX_HEART_RATE),
  };
}

export function heartRateZoneLabel(zone: HeartRateZone): string {
  return HEART_RATE_ZONE_BANDS.find((b) => b.zone === zone)!.labelDe;
}
