//
//  FitTrackComplication.swift
//  FitTrackComplication
//
//  Watch face complication showing the current Recovery Score — visible
//  without opening any app. Reads the same shared App Group snapshot
//  SharedDataPlugin.swift (phone) writes and RecoveryScoreWidget.swift
//  (phone home-screen widget) already reads, so there's a single source of
//  truth across all three surfaces. No network access from this process.
//

import WidgetKit
import SwiftUI

private let recoveryAppGroup = "group.com.robeltsefaye.fittrackpro"
private let recoverySnapshotKey = "recoveryScoreSnapshot"
private let recoveryStaleAfter: TimeInterval = 24 * 60 * 60

struct RecoverySnapshot: Decodable {
    let score: Int
    let level: String
    let updatedAt: Date
}

private func loadRecoverySnapshot() -> RecoverySnapshot? {
    guard let json = UserDefaults(suiteName: recoveryAppGroup)?.string(forKey: recoverySnapshotKey),
          let data = json.data(using: .utf8) else { return nil }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    guard let snapshot = try? decoder.decode(RecoverySnapshot.self, from: data),
          Date().timeIntervalSince(snapshot.updatedAt) < recoveryStaleAfter else { return nil }
    return snapshot
}

private func levelColor(_ level: String) -> Color {
    switch level {
    case "high": return .green
    case "mid": return .orange
    case "low": return .red
    default: return .secondary
    }
}

struct RecoveryComplicationEntry: TimelineEntry {
    let date: Date
    let snapshot: RecoverySnapshot?
}

struct RecoveryComplicationProvider: TimelineProvider {
    func placeholder(in context: Context) -> RecoveryComplicationEntry {
        RecoveryComplicationEntry(date: Date(), snapshot: RecoverySnapshot(score: 78, level: "high", updatedAt: Date()))
    }

    func getSnapshot(in context: Context, completion: @escaping (RecoveryComplicationEntry) -> Void) {
        completion(RecoveryComplicationEntry(date: Date(), snapshot: loadRecoverySnapshot()))
    }

    /// Single static entry, same as the phone widget — value only changes
    /// when the app writes a fresh snapshot and calls
    /// WidgetCenter.reloadAllTimelines(), not via internal polling.
    func getTimeline(in context: Context, completion: @escaping (Timeline<RecoveryComplicationEntry>) -> Void) {
        let entry = RecoveryComplicationEntry(date: Date(), snapshot: loadRecoverySnapshot())
        completion(Timeline(entries: [entry], policy: .never))
    }
}

struct FitTrackComplicationEntryView: View {
    @Environment(\.widgetFamily) private var family
    var entry: RecoveryComplicationProvider.Entry

    var body: some View {
        switch family {
        case .accessoryCircular:
            circularView
        case .accessoryRectangular:
            rectangularView
        case .accessoryInline:
            inlineView
        default:
            circularView
        }
    }

    @ViewBuilder
    private var circularView: some View {
        if let snapshot = entry.snapshot {
            Gauge(value: Double(snapshot.score), in: 0...100) {
                Image(systemName: "waveform.path.ecg")
            } currentValueLabel: {
                Text("\(snapshot.score)")
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
            }
            .gaugeStyle(.accessoryCircular)
            .tint(levelColor(snapshot.level))
        } else {
            Image(systemName: "waveform.path.ecg")
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var rectangularView: some View {
        if let snapshot = entry.snapshot {
            VStack(alignment: .leading, spacing: 1) {
                Text("RECOVERY")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.secondary)
                Text("\(snapshot.score)")
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(levelColor(snapshot.level))
            }
        } else {
            Text("Keine Daten")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var inlineView: some View {
        if let snapshot = entry.snapshot {
            Text("Recovery \(snapshot.score)")
        } else {
            Text("Recovery —")
        }
    }
}

struct FitTrackComplication: Widget {
    let kind: String = "FitTrackComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: RecoveryComplicationProvider()) { entry in
            if #available(iOS 17.0, watchOS 10.0, *) {
                FitTrackComplicationEntryView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                FitTrackComplicationEntryView(entry: entry)
            }
        }
        .configurationDisplayName("Recovery Score")
        .description("Zeigt deinen aktuellen Recovery-Score auf dem Zifferblatt.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

@available(iOS 17.0, *)
#Preview(as: .accessoryCircular) {
    FitTrackComplication()
} timeline: {
    RecoveryComplicationEntry(date: .now, snapshot: RecoverySnapshot(score: 82, level: "high", updatedAt: .now))
    RecoveryComplicationEntry(date: .now, snapshot: nil)
}
