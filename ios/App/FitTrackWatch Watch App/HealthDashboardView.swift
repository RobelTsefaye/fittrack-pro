//
//  HealthDashboardView.swift
//  FitTrackWatch Watch App
//
//  Custom health glance screen — Recovery Score ring, heart rate, resting HR
//  and HRV, plus a live badge when a workout is running. Recovery comes from
//  the phone (health-dashboard.tsx pushes it via WatchConnectivity, since the
//  Watch is a separate device from the phone's own widget/complication and
//  can't read their local App Group snapshot); the vitals are read straight
//  from HealthKit on-device — paired Watch and iPhone share the same
//  underlying HealthKit store, so this reflects the latest sample either
//  device recorded.
//

import SwiftUI

struct HealthDashboardView: View {
    @ObservedObject var workoutManager: WorkoutManager
    @ObservedObject var phoneObserver: PhoneWorkoutObserver

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                recoveryRing

                if workoutManager.isRunning || phoneObserver.activeWorkout != nil {
                    liveBadge
                }

                VStack(spacing: 8) {
                    statRow(
                        icon: "heart.fill",
                        color: .red,
                        label: "Herzfrequenz",
                        value: heartRateDisplay
                    )
                    statRow(
                        icon: "heart.text.square.fill",
                        color: .pink,
                        label: "Ruhepuls",
                        value: formattedBPM(workoutManager.restingHeartRate)
                    )
                    statRow(
                        icon: "waveform.path.ecg",
                        color: .cyan,
                        label: "HRV",
                        value: formattedMs(workoutManager.heartRateVariability)
                    )
                }
            }
            .padding()
        }
        .background(
            LinearGradient(
                colors: [.black, recoveryColor.opacity(0.25)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        )
        .navigationTitle("Health")
        .onAppear { workoutManager.loadHealthSnapshot() }
    }

    @ViewBuilder
    private var recoveryRing: some View {
        ZStack {
            Circle()
                .stroke(recoveryColor.opacity(0.2), lineWidth: 10)
            if let score = phoneObserver.recoveryScore {
                Circle()
                    .trim(from: 0, to: CGFloat(score) / 100)
                    .stroke(recoveryColor, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: 0) {
                    Text("\(score)")
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundStyle(recoveryColor)
                    Text("RECOVERY")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
            } else {
                Text("—")
                    .font(.system(size: 28, weight: .semibold, design: .rounded))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 110, height: 110)
    }

    private var liveBadge: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(.red)
                .frame(width: 6, height: 6)
            Text("Training läuft")
                .font(.system(size: 11, weight: .semibold))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(.red.opacity(0.18), in: Capsule())
        .foregroundStyle(.red)
    }

    @ViewBuilder
    private func statRow(icon: String, color: Color, label: String, value: String) -> some View {
        HStack {
            Image(systemName: icon)
                .foregroundStyle(color)
                .frame(width: 20)
            Text(label)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .monospacedDigit()
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
    }

    private var heartRateDisplay: String {
        // Prefer the live stream while a workout is running (updates
        // continuously); otherwise fall back to the latest HealthKit sample.
        if workoutManager.isRunning, workoutManager.heartRate > 0 {
            return formattedBPM(workoutManager.heartRate)
        }
        return formattedBPM(workoutManager.latestHeartRate)
    }

    private var recoveryColor: Color {
        switch phoneObserver.recoveryLevel {
        case "high": return .green
        case "mid": return .orange
        case "low": return .red
        default: return .secondary
        }
    }

    private func formattedBPM(_ value: Double?) -> String {
        guard let value, value > 0 else { return "—" }
        return "\(Int(value.rounded())) bpm"
    }

    private func formattedMs(_ value: Double?) -> String {
        guard let value, value > 0 else { return "—" }
        return "\(Int(value.rounded())) ms"
    }
}

#Preview {
    // #Preview's trailing closure is a ViewBuilder context — bare
    // assignment statements (Void-returning) directly in it get treated as
    // "this should be a View" and fail to compile, so mock-object setup
    // happens inside ordinary immediately-invoked closures instead.
    let observer: PhoneWorkoutObserver = {
        let o = PhoneWorkoutObserver()
        o.recoveryScore = 78
        o.recoveryLevel = "high"
        return o
    }()
    let manager: WorkoutManager = {
        let m = WorkoutManager()
        m.latestHeartRate = 64
        m.restingHeartRate = 52
        m.heartRateVariability = 41
        return m
    }()
    return NavigationStack {
        HealthDashboardView(workoutManager: manager, phoneObserver: observer)
    }
}

#Preview("Keine Daten") {
    NavigationStack {
        HealthDashboardView(workoutManager: WorkoutManager(), phoneObserver: PhoneWorkoutObserver())
    }
}
