//
//  WatchTheme.swift
//  FitTrackWatch Watch App
//
//  One visual language with the phone app's dark mode ("Volt", globals.css):
//  volt #D4FF3A for the primary action, near-black surfaces, the same
//  per-day colours as split-hue.ts and the same zone colours as the phone's
//  cardio page — so a day, a zone or "the main button" reads identically on
//  both devices.
//

import SwiftUI

extension Color {
    /// 0xRRGGBB
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

enum Theme {
    /// Phone primary in dark mode (--primary, #D4FF3A).
    static let volt = Color(hex: 0xD4FF3A)
    /// Text on volt (--primary-foreground, #0A1300).
    static let voltInk = Color(hex: 0x0A1300)
    /// Card surface (#121214) and raised fill (#26262B).
    static let surface = Color(hex: 0x121214)
    static let raised = Color(hex: 0x26262B)
    /// Secondary label (#9A9AA2).
    static let label2 = Color(hex: 0x9A9AA2)
    static let heart = Color(hex: 0xFF5A5F)
    static let energy = Color(hex: 0xFF9F40)
    static let rest = Color(hex: 0xFF9F40)
    static let danger = Color(hex: 0xFF5A5A)

    /// Same colour per training day as split-hue.ts on the phone (push warm,
    /// pull cool, legs green …, anything else a stable colour from its name).
    static func hue(for name: String) -> Color {
        let lower = name.lowercased()
        let rules: [([String], UInt32)] = [
            (["push", "brust", "chest"], 0xFF8A4C),
            (["pull", "rücken", "ruecken", "back"], 0x4CC2FF),
            (["leg", "bein", "lower", "unterk"], 0x7CE07A),
            (["upper", "oberk"], 0xB48CFF),
            (["full", "ganzk"], 0xFF6B9A),
            (["cardio", "lauf", "run", "rad", "bike", "swim"], 0xFF5A5F),
            (["arm", "schulter", "shoulder"], 0xFFD24C),
        ]
        for (words, hex) in rules where words.contains(where: { lower.contains($0) }) {
            return Color(hex: hex)
        }
        let fallback: [UInt32] = [0x4CC2FF, 0xB48CFF, 0xFFD24C, 0x7CE07A, 0xFF8A4C, 0xFF6B9A]
        // (h * 31 + charCode) >>> 0 over UTF-16 code units, like the JS loop.
        var h: UInt32 = 0
        for unit in name.utf16 {
            h = h &* 31 &+ UInt32(unit)
        }
        return Color(hex: fallback[Int(h % UInt32(fallback.count))])
    }

    /// ZONE_COLORS on the phone's cardio page (cool → warm).
    static func zoneColor(_ zone: Int) -> Color {
        switch zone {
        case 1: return Color(hex: 0x4A9EFF)
        case 2: return Color(hex: 0x2DD4C4)
        case 3: return Color(hex: 0x34D058)
        case 4: return Color(hex: 0xFF9F40)
        default: return Color(hex: 0xFF5A5A)
        }
    }
}

/// The one primary action per screen: volt capsule, dark text.
struct VoltButtonStyle: ButtonStyle {
    var fill: Color = Theme.volt
    var ink: Color = Theme.voltInk

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold, design: .rounded))
            .foregroundStyle(ink)
            .frame(maxWidth: .infinity, minHeight: 44)
            .padding(.horizontal, 8)
            .background(fill, in: Capsule())
            .opacity(configuration.isPressed ? 0.7 : 1)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}

/// Secondary actions and pickable tiles: raised surface, rounded.
struct TileButtonStyle: ButtonStyle {
    var fill: Color = Theme.raised
    var corner: CGFloat = 14

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(fill, in: RoundedRectangle(cornerRadius: corner, style: .continuous))
            .opacity(configuration.isPressed ? 0.7 : 1)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}

/// Small uppercase label above a group, like the phone's section eyebrows.
struct Eyebrow: View {
    let text: String
    var color: Color = Theme.label2

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .semibold))
            .tracking(0.6)
            .foregroundStyle(color)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

enum Fmt {
    /// 7:05 or 1:02:07.
    static func clock(_ seconds: Int) -> String {
        let total = max(0, seconds)
        let h = total / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }

    /// 60 / 62,5 — German decimal comma like the phone.
    static func weight(_ value: Double?) -> String {
        guard let value else { return "–" }
        if value.truncatingRemainder(dividingBy: 1) == 0 { return String(format: "%.0f", value) }
        return String(format: "%.1f", value).replacingOccurrences(of: ".", with: ",")
    }

    /// "60 × 10" (kg implied by the context).
    static func setLine(weight: Double?, reps: Int?) -> String {
        "\(Self.weight(weight)) × \(reps.map { "\($0)" } ?? "–")"
    }

    /// 12.480 kg → "12,5 t", below 10 t as "8.430 kg".
    static func volume(_ kg: Double) -> String {
        if kg >= 10_000 {
            return String(format: "%.1f t", kg / 1000).replacingOccurrences(of: ".", with: ",")
        }
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 0
        return "\(formatter.string(from: NSNumber(value: kg)) ?? String(Int(kg))) kg"
    }
}
