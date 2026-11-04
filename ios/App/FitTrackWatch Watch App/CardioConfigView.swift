import SwiftUI

/// Before a cardio session started on the Watch: duration and target zone
/// (step goal for walking) — the same choices as the phone's cardio page.
/// No manual dismiss needed: once the session runs, ContentView switches to
/// the live screen.
struct CardioConfigView: View {
    @ObservedObject var coordinator: WatchCoordinator
    let kind: CardioKind

    @State private var durationMinutes = 0
    @State private var targetZone = 0
    @State private var stepGoal = 0

    private static let durationChoices = [0, 15, 20, 30, 45, 60, 75, 90]
    private static let stepGoalChoices = [0, 5000, 8000, 10000, 12000, 15000]

    var body: some View {
        List {
            Section {
                HStack(spacing: 10) {
                    Image(systemName: kind.icon)
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundStyle(Theme.volt)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(kind.title)
                            .font(.system(size: 17, weight: .bold, design: .rounded))
                        Text(kind.subtitle)
                            .font(.footnote)
                            .foregroundStyle(Theme.label2)
                    }
                }
                .listRowBackground(Color.clear)
            }

            Section {
                if kind == .walk {
                    Picker("Schrittziel", selection: $stepGoal) {
                        ForEach(Self.stepGoalChoices, id: \.self) { goal in
                            Text(goal == 0 ? "Kein Ziel" : "\(goal)").tag(goal)
                        }
                    }
                } else {
                    Picker("Dauer", selection: $durationMinutes) {
                        ForEach(Self.durationChoices, id: \.self) { minutes in
                            Text(minutes == 0 ? "Frei" : "\(minutes) min").tag(minutes)
                        }
                    }
                    Picker("Zielzone", selection: $targetZone) {
                        Text("Keine").tag(0)
                        ForEach(1...5, id: \.self) { zone in
                            Text("Zone \(zone) · \(HeartRateZones.labelDe(forZone: zone))").tag(zone)
                        }
                    }
                }
            }

            Section {
                Button {
                    coordinator.startCardio(
                        kind,
                        minutes: durationMinutes == 0 ? nil : durationMinutes,
                        zone: targetZone == 0 ? nil : targetZone,
                        stepGoal: stepGoal == 0 ? nil : stepGoal
                    )
                } label: {
                    Label("Starten", systemImage: "play.fill")
                }
                .buttonStyle(VoltButtonStyle())
                .listRowBackground(Color.clear)
            } footer: {
                Text("Läuft in FitTrack auf der Uhr, wird in Health gespeichert und live aufs iPhone übertragen.")
            }
        }
        .navigationTitle(kind.title)
    }
}
