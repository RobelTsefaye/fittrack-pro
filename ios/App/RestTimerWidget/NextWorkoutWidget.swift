import WidgetKit
import SwiftUI

private let nextWorkoutAppGroup = "group.com.robeltsefaye.fittrackpro"
private let nextWorkoutSnapshotKey = "nextWorkoutSnapshot"
private let nextWorkoutStaleAfter: TimeInterval = 48 * 60 * 60

struct NextWorkoutSnapshot: Decodable {
    let streak: Int
    let sessionName: String?
    let planName: String?
    let updatedAt: Date
}

private func decodeNextWorkoutSnapshot(from json: String) -> NextWorkoutSnapshot? {
    guard let data = json.data(using: .utf8) else { return nil }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return try? decoder.decode(NextWorkoutSnapshot.self, from: data)
}

private func loadNextWorkoutSnapshot() -> NextWorkoutSnapshot? {
    guard let json = UserDefaults(suiteName: nextWorkoutAppGroup)?.string(forKey: nextWorkoutSnapshotKey),
          let snapshot = decodeNextWorkoutSnapshot(from: json) else { return nil }
    guard Date().timeIntervalSince(snapshot.updatedAt) < nextWorkoutStaleAfter else { return nil }
    return snapshot
}

struct NextWorkoutEntry: TimelineEntry {
    let date: Date
    let snapshot: NextWorkoutSnapshot?
}

struct NextWorkoutProvider: TimelineProvider {
    func placeholder(in context: Context) -> NextWorkoutEntry {
        NextWorkoutEntry(
            date: Date(),
            snapshot: NextWorkoutSnapshot(streak: 5, sessionName: "Push Day", planName: "Upper/Lower Split", updatedAt: Date())
        )
    }
    func getSnapshot(in context: Context, completion: @escaping (NextWorkoutEntry) -> Void) {
        completion(NextWorkoutEntry(date: Date(), snapshot: loadNextWorkoutSnapshot()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<NextWorkoutEntry>) -> Void) {
        let entry = NextWorkoutEntry(date: Date(), snapshot: loadNextWorkoutSnapshot())
        completion(Timeline(entries: [entry], policy: .never))
    }
}

struct NextWorkoutWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: NextWorkoutEntry

    var body: some View {
        if let snapshot = entry.snapshot {
            if snapshot.sessionName == nil {
                noPlanState
            } else {
                content(for: snapshot)
            }
        } else {
            emptyState
        }
    }

    @ViewBuilder
    private func content(for snapshot: NextWorkoutSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("NÄCHSTES WORKOUT")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)

            Text(snapshot.sessionName ?? "—")
                .font(.system(size: family == .systemSmall ? 18 : 22, weight: .bold, design: .rounded))
                .lineLimit(2)
                .minimumScaleFactor(0.7)

            if family == .systemMedium, let planName = snapshot.planName {
                Text(planName)
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 4)

            HStack(spacing: 4) {
                Text("🔥")
                Text("\(snapshot.streak)")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding()
        .containerBackground(.fill.tertiary, for: .widget)
    }

    private var noPlanState: some View {
        VStack(spacing: 4) {
            Image(systemName: "calendar.badge.plus")
                .font(.system(size: 22))
                .foregroundStyle(.secondary)
            Text("Kein Plan aktiv")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .containerBackground(.fill.tertiary, for: .widget)
    }

    private var emptyState: some View {
        VStack(spacing: 4) {
            Image(systemName: "figure.strengthtraining.traditional")
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

struct NextWorkoutWidget: Widget {
    let kind: String = "NextWorkoutWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NextWorkoutProvider()) { entry in
            NextWorkoutWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Nächstes Workout")
        .description("Zeigt dein nächstes geplantes Workout und deine aktuelle Streak.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

#Preview(as: .systemSmall) {
    NextWorkoutWidget()
} timeline: {
    NextWorkoutEntry(date: .now, snapshot: NextWorkoutSnapshot(streak: 5, sessionName: "Push Day", planName: "Upper/Lower Split", updatedAt: .now))
    NextWorkoutEntry(date: .now, snapshot: NextWorkoutSnapshot(streak: 0, sessionName: nil, planName: nil, updatedAt: .now))
    NextWorkoutEntry(date: .now, snapshot: nil)
}
