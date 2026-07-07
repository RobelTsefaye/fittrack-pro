//
//  RecoveryScoreWidget.swift
//  RestTimerWidget
//
//  Home-screen widget showing the current recovery score without needing
//  to open the app. Reads a small JSON snapshot written by the phone app
//  (SharedDataPlugin.swift) into the shared App Group UserDefaults — the
//  widget process has no network/auth access, so it never calls the API
//  itself. WidgetKit reloads this widget on its own schedule, or on demand
//  via WidgetCenter.shared.reloadAllTimelines() triggered from the app.
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

private func decodeRecoverySnapshot(from json: String) -> RecoverySnapshot? {
    guard let data = json.data(using: .utf8) else { return nil }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return try? decoder.decode(RecoverySnapshot.self, from: data)
}

/// Reads the latest snapshot from shared UserDefaults. Returns nil if
/// missing, malformed, or older than `recoveryStaleAfter`.
private func loadRecoverySnapshot() -> RecoverySnapshot? {
    guard let json = UserDefaults(suiteName: recoveryAppGroup)?.string(forKey: recoverySnapshotKey),
          let snapshot = decodeRecoverySnapshot(from: json) else {
        return nil
    }
    guard Date().timeIntervalSince(snapshot.updatedAt) < recoveryStaleAfter else {
        return nil
    }
    return snapshot
}

private func levelLabel(_ level: String) -> String {
    switch level {
    case "high": return "Ready to Train"
    case "mid": return "Moderate"
    case "low": return "Rest Day"
    default: return "Keine Daten"
    }
}

private func levelColor(_ level: String) -> Color {
    switch level {
    case "high": return .green
    case "mid": return .orange
    case "low": return .red
    default: return .secondary
    }
}

struct RecoveryScoreEntry: TimelineEntry {
    let date: Date
    let snapshot: RecoverySnapshot?
}

struct RecoveryScoreProvider: TimelineProvider {
    func placeholder(in context: Context) -> RecoveryScoreEntry {
        RecoveryScoreEntry(date: Date(), snapshot: RecoverySnapshot(score: 78, level: "high", updatedAt: Date()))
    }

    func getSnapshot(in context: Context, completion: @escaping (RecoveryScoreEntry) -> Void) {
        completion(RecoveryScoreEntry(date: Date(), snapshot: loadRecoverySnapshot()))
    }

    /// A single static entry — the value only changes when the app writes a
    /// new snapshot and triggers WidgetCenter.reloadAllTimelines(), or when
    /// the OS reloads the widget on its own schedule. No internal polling.
    func getTimeline(in context: Context, completion: @escaping (Timeline<RecoveryScoreEntry>) -> Void) {
        let entry = RecoveryScoreEntry(date: Date(), snapshot: loadRecoverySnapshot())
        completion(Timeline(entries: [entry], policy: .never))
    }
}

struct RecoveryScoreWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: RecoveryScoreEntry

    var body: some View {
        if let snapshot = entry.snapshot {
            content(for: snapshot)
        } else {
            emptyState
        }
    }

    @ViewBuilder
    private func content(for snapshot: RecoverySnapshot) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("RECOVERY")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)

            Text("\(snapshot.score)")
                .font(.system(size: family == .systemSmall ? 40 : 48, weight: .bold, design: .rounded))
                .foregroundStyle(levelColor(snapshot.level))

            Text(levelLabel(snapshot.level))
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(levelColor(snapshot.level))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding()
        .containerBackground(.fill.tertiary, for: .widget)
    }

    private var emptyState: some View {
        VStack(spacing: 4) {
            Image(systemName: "waveform.path.ecg")
                .font(.system(size: 22))
                .foregroundStyle(.secondary)
            Text("Keine Daten")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

struct RecoveryScoreWidget: Widget {
    let kind: String = "RecoveryScoreWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: RecoveryScoreProvider()) { entry in
            RecoveryScoreWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Recovery Score")
        .description("Zeigt deinen aktuellen Recovery-Score auf dem Homescreen.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

#Preview(as: .systemSmall) {
    RecoveryScoreWidget()
} timeline: {
    RecoveryScoreEntry(date: .now, snapshot: RecoverySnapshot(score: 82, level: "high", updatedAt: .now))
    RecoveryScoreEntry(date: .now, snapshot: nil)
}
