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
    /// Total seconds spent in the currently-active zone this session
    /// (cumulative across the whole session, summed even across leaving and
    /// re-entering the zone) — computed in CardioPictureInPicturePlugin.
    var elapsedSeconds: Int = 0
    /// Advancing phase (radians) driven by the plugin's 10fps render loop at
    /// the actual bpm — the heart icon scales with sin(beatPhase), so it
    /// visibly beats at the wearer's real heart rate.
    var beatPhase: Double = 0

    /// mm:ss, or h:mm:ss once past an hour.
    private var elapsedString: String {
        let s = max(0, elapsedSeconds)
        let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        return h > 0
            ? String(format: "%d:%02d:%02d", h, m, sec)
            : String(format: "%d:%02d", m, sec)
    }

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

            // Single horizontal row so the window can be a genuinely flat,
            // long bar (see the ~5:1 .frame below) rather than a tall tile.
            HStack(spacing: 14) {
                Text(zone.map(String.init) ?? "–")
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .foregroundStyle(zoneColor)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)

                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 5) {
                        Image(systemName: "heart.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(.red)
                            // Subtle systole/diastole squeeze at the real bpm.
                            .scaleEffect(1 + 0.08 * sin(beatPhase))
                        Text("\(Int(heartRate.rounded()))")
                            .font(.system(size: 26, weight: .semibold, design: .rounded))
                            .foregroundStyle(.white)
                            .monospacedDigit()
                    }
                    Text(elapsedString)
                        .font(.system(size: 14, weight: .medium, design: .rounded))
                        // Explicit light gray — NOT `.secondary`: ImageRenderer
                        // renders in light mode, so `.secondary` resolves to a
                        // dark gray that's unreadable on the black background.
                        .foregroundStyle(Color.white.opacity(0.7))
                        .monospacedDigit()
                }

                // Zone bands take the remaining width — all 5 zones always
                // shown, the active one highlighted, with a pointer at the
                // live position within it (same idea as the web cardio page).
                HStack(spacing: 4) {
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
                        .frame(height: 8)
                    }
                }
            }
            .padding(.horizontal, 20)
        }
        // Really flat and long — a slim status bar, ~5:1.
        .frame(width: 440, height: 84)
    }
}

#Preview {
    CardioPipContentView(heartRate: 142, zone: 3, elapsedSeconds: 1_275)
}
