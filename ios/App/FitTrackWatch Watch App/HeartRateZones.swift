//
//  HeartRateZones.swift
//  FitTrackWatch Watch App
//
//  Mirrors src/lib/heart-rate-zones.ts exactly. This is the only place the
//  *current* zone is ever computed — the Watch is the only device with an
//  actual HR sensor, so it determines the zone once here and pushes the
//  resulting number to the phone (see PhoneWorkoutObserver.pushCardioLiveUpdate)
//  rather than the phone re-deriving it from a relayed bpm value, which
//  would risk two independently-implemented formulas drifting apart.
//

import Foundation

enum HeartRateZones {
    /// 220 - 21 (see src/lib/heart-rate-zones.ts for the same constant).
    static let maxHeartRate: Double = 199

    /// (zone, minPct, maxPct) — percentage bands of maxHeartRate, matching
    /// Apple's own Watch Heart Rate Zones feature.
    private static let bands: [(zone: Int, minPct: Double, maxPct: Double)] = [
        (1, 0.5, 0.6),
        (2, 0.6, 0.7),
        (3, 0.7, 0.8),
        (4, 0.8, 0.9),
        (5, 0.9, 1.5),
    ]

    /// nil below Zone 1's lower bound (resting/warming up — not yet in any
    /// zone) or for a non-positive/missing reading.
    static func zone(forBpm bpm: Double) -> Int? {
        guard bpm > 0 else { return nil }
        let pct = bpm / maxHeartRate
        guard pct >= bands[0].minPct else { return nil }
        for band in bands where pct >= band.minPct && pct < band.maxPct {
            return band.zone
        }
        return 5
    }

    /// bpm bounds for a zone — drives the position pointer within the zone
    /// band (see ZoneIndicatorView), i.e. "just entered Zone 3" vs. "about
    /// to cross into Zone 4," not just which zone.
    static func bpmRange(forZone zone: Int) -> (min: Double, max: Double) {
        let band = bands.first { $0.zone == zone } ?? bands[bands.count - 1]
        return (band.minPct * maxHeartRate, min(band.maxPct, 1) * maxHeartRate)
    }

    /// 0 at the zone's lower bound, 1 at its upper bound, clamped — where
    /// exactly `bpm` sits within `zone`'s range right now.
    static func positionWithinZone(bpm: Double, zone: Int) -> Double {
        let range = bpmRange(forZone: zone)
        guard range.max > range.min else { return 0 }
        return min(1, max(0, (bpm - range.min) / (range.max - range.min)))
    }

    static func labelDe(forZone zone: Int) -> String {
        switch zone {
        case 1: return "Erholung"
        case 2: return "Fettverbrennung"
        case 3: return "Ausdauer"
        case 4: return "Schwelle"
        default: return "Maximal"
        }
    }
}
