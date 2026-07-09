import SwiftUI

/// The PiP window's actual content — rendered offscreen into a pixel buffer
/// by CardioPictureInPicturePlugin, never shown as a normal on-screen view.
/// Deliberately reduced to the two numbers that matter at a glance (zone,
/// bpm): the system PiP window on iPad starts small and the user may shrink
/// it further, so anything beyond "current zone, current heart rate" would
/// just get clipped or illegible.
struct CardioPipContentView: View {
    let heartRate: Double
    let zone: Int?

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

    private var zoneColor: Color {
        zone.flatMap { Self.zoneColors[$0] } ?? .gray
    }

    var body: some View {
        ZStack {
            Color.black

            VStack(spacing: 6) {
                Text(zone.map(String.init) ?? "–")
                    .font(.system(size: 96, weight: .bold, design: .rounded))
                    .foregroundStyle(zoneColor)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)

                HStack(spacing: 8) {
                    Image(systemName: "heart.fill")
                        .font(.system(size: 28))
                        .foregroundStyle(.red)
                    Text("\(Int(heartRate.rounded()))")
                        .font(.system(size: 44, weight: .semibold, design: .rounded))
                        .foregroundStyle(.white)
                        .monospacedDigit()
                }
            }
        }
        // Square: the content is two numbers, not a wide scene — a square
        // window wastes less of the small default PiP size than 16:9 would.
        .frame(width: 300, height: 300)
    }
}

#Preview {
    CardioPipContentView(heartRate: 142, zone: 3)
}
