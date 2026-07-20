import SwiftUI
import HealthKit

/// Pre-start configuration for a cardio session: indoor/outdoor (running and
/// cycling only — Crosstrainer is always indoor), duration and target zone.
/// Pushed from StartView; no manual dismiss needed — once the session starts,
/// ContentView's top-level routing replaces this whole NavigationStack with
/// LiveWorkoutView, same as the previous direct-start buttons.
struct CardioConfigView: View {
    @ObservedObject var workoutManager: WorkoutManager
    let activityType: HKWorkoutActivityType
    let title: String

    @State private var isIndoor: Bool
    @State private var durationMinutes: Int = 0
    @State private var targetZone: Int = 0

    private static let durationChoices = [0, 30, 45, 60, 75, 90]

    init(workoutManager: WorkoutManager, activityType: HKWorkoutActivityType, title: String) {
        self.workoutManager = workoutManager
        self.activityType = activityType
        self.title = title
        self._isIndoor = State(initialValue: activityType == .elliptical)
    }

    var body: some View {
        List {
            if activityType != .elliptical {
                Picker("Ort", selection: $isIndoor) {
                    Text("Outdoor").tag(false)
                    Text("Indoor").tag(true)
                }
            }
            Picker("Dauer", selection: $durationMinutes) {
                ForEach(Self.durationChoices, id: \.self) { m in
                    Text(m == 0 ? "Frei" : "\(m) min").tag(m)
                }
            }
            Picker("Zielzone", selection: $targetZone) {
                Text("Keine").tag(0)
                ForEach(1...5, id: \.self) { z in
                    Text("Zone \(z)").tag(z)
                }
            }
            Button {
                workoutManager.start(plan: CardioSessionPlan(
                    activityType: activityType,
                    isIndoor: isIndoor,
                    durationMinutes: durationMinutes == 0 ? nil : durationMinutes,
                    targetZone: targetZone == 0 ? nil : targetZone
                ))
            } label: {
                Label("Starten", systemImage: "play.fill")
            }
            .tint(.green)
        }
        .navigationTitle(title)
    }
}
