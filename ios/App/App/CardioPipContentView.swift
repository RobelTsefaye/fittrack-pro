import SwiftUI

/// The PiP window's actual content — rendered offscreen into a pixel buffer
/// by CardioPictureInPicturePlugin, never shown as a normal on-screen view.
/// Deliberately reduced to the two numbers that matter at a glance (zone,
/// bpm): the system PiP window on iPad starts small and the user may shrink
/// it further, so anything beyond "current zone, current heart rate" would
/// just get clipped or illegible.
///
/// Wide-and-short (not square): laid out side-by-side so the window reads as
/// a slim overlay bar rather than a big floating tile.
struct CardioPipContentView: View {
    let heartRate: Double
    let zone: Int?
    /// Advancing phase (radians) driven by the plugin's 10fps render loop at
    /// the actual bpm — the heart icon scales with sin(beatPhase), so it
    /// visibly beats at the wearer's real heart rate.
    var beatPhase: Double = 0

    /// Matches ZONE_COLORS in src/app/(app)/workouts/cardio/page.tsx exactly
    /// (which itself matches HeartRateZones.color(for:) in intent, though
    /// that Watch-side version uses plain system colors — this mirrors the
    /// phone web page's specific hex values since that's the more visible
    /// reference point for anyone comparing the two).
    private static let zoneColors: [Int: Color] = [
        1: Color(red: 0x4A / 255, green: 0x9E / 255, blue: 0xFF / 255),
        2: Color(red: 0x2D / 255, green: 0xD4 / 255, blue: 0xC4 / 255),
        3: Color(red: 0x34 / 255, green: 0xD0 / 255, blue: 0x58 / 255),
        4: Color(red: 0xFF / 255, green: 0x9F / 255, blue: 0x40 / 255),
        5: Color(red: 0xFF / 255, green: 0x5A / 255, blue: 0x5A / 255),
    ]

    /// Mirrors HEART_RATE_ZONE_BANDS / MAX_HEART_RATE in
    /// src/lib/heart-rate-zones.ts — min/max %, of MAX_HEART_RATE = 199 (220 - 21).
    private static let zoneBpmRanges: [Int: (min: Double, max: Double)] = [
        1: (0.5 * 199, 0.6 * 199),
        2: (0.6 * 199, 0.7 * 199),
        3: (0.7 * 199, 0.8 * 199),
        4: (0.8 * 199, 0.9 * 199),
        5: (0.9 * 199, 199),
    ]

    private var zoneColor: Color {
        zone.flatMap { Self.zoneColors[$0] } ?? .gray
    }

    /// Where exactly within the current zone's bpm range the live heart rate
    /// sits (0 = just entered the zone, 1 = about to cross into the next
    /// one) — same math as zonePointerFraction in the web cardio page.
    private var zonePointerFraction: CGFloat? {
        guard let zone, let range = Self.zoneBpmRanges[zone] else { return nil }
        let fraction = (heartRate - range.min) / (range.max - range.min)
        return CGFloat(min(1, max(0, fraction)))
    }

    var body: some View {
        ZStack {
            Color.black

            VStack(spacing: 10) {
                HStack(spacing: 12) {
                    Text(zone.map(String.init) ?? "–")
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .foregroundStyle(zoneColor)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)

                    HStack(spacing: 5) {
                        Image(systemName: "heart.fill")
                            .font(.system(size: 15))
                            .foregroundStyle(.red)
                            // Subtle systole/diastole squeeze at the real bpm.
                            .scaleEffect(1 + 0.08 * sin(beatPhase))
                        Text("\(Int(heartRate.rounded()))")
                            .font(.system(size: 24, weight: .semibold, design: .rounded))
                            .foregroundStyle(.white)
                            .monospacedDigit()
                    }
                }

                // Zone bands — same idea as the web cardio page's band row:
                // all 5 zones always shown, the active one highlighted, with
                // a pointer at the live position within it.
                HStack(spacing: 3) {
                    ForEach(1...5, id: \.self) { bandZone in
                        let isActive = bandZone == zone
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Self.zoneColors[bandZone] ?? .gray)
                                .opacity(isActive ? 1 : 0.25)

                            if isActive, let fraction = zonePointerFraction {
                                GeometryReader { geo in
                                    Capsule()
                                        .fill(.white)
                                        .frame(width: 2.5)
                                        .position(x: geo.size.width * fraction, y: geo.size.height / 2)
                                }
                            }
                        }
                        .frame(height: 7)
                    }
                }
            }
            .padding(.horizontal, 18)
        }
        // Wide and short — a slim overlay bar, not a big floating tile.
        .frame(width: 300, height: 120)
    }
}

#Preview {
    CardioPipContentView(heartRate: 142, zone: 3)
}
