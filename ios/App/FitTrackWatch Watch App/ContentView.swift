//
//  ContentView.swift
//  FitTrackWatch Watch App
//
//  Live workout screen: heart rate + active calories + elapsed time,
//  streamed from HKLiveWorkoutBuilder via WorkoutManager. The finished
//  workout saves to HealthKit and appears in the iPhone app's Cardio
//  section on the next HealthKit sync — no direct network call needed
//  from the Watch itself.
//
//  Also mirrors whatever workout is currently active on the paired iPhone
//  (via PhoneWorkoutObserver / WatchConnectivity): starting a workout on the
//  phone jumps the Watch straight into the same logging UI used for
//  Watch-initiated sessions (KraftLoggingView), auto-starts HR/calorie
//  tracking, and pages over to the live HR screen with a swipe — no manual
//  "start tracking" tap needed.
//

import SwiftUI
import HealthKit

/** Workout types offered on the Watch's start screen, with German labels
 *  and SF Symbols matching the phone app's iconography. */
private struct WorkoutTypeOption: Identifiable {
    let id: HKWorkoutActivityType
    let label: String
    let icon: String

    static let all: [WorkoutTypeOption] = [
        WorkoutTypeOption(id: .traditionalStrengthTraining, label: "Kraft", icon: "figure.strengthtraining.traditional"),
        WorkoutTypeOption(id: .running, label: "Laufen", icon: "figure.run"),
        WorkoutTypeOption(id: .cycling, label: "Radfahren", icon: "figure.outdoor.cycle"),
        WorkoutTypeOption(id: .elliptical, label: "Crosstrainer", icon: "figure.elliptical"),
        WorkoutTypeOption(id: .walking, label: "Spazieren", icon: "figure.walk"),
    ]
}

struct ContentView: View {
    @StateObject private var workoutManager = WorkoutManager()
    @StateObject private var phoneObserver = PhoneWorkoutObserver()
    @StateObject private var routeTracker = RouteLocationTracker()

    /// Which page of the phone-workout TabView is showing. Defaults to the
    /// logging page (1) — swipe right for controls (0), left for live HR (2).
    @State private var selectedPage = 1

    /// True once at least one live cardio push has gone out for the
    /// *current* session — see the isRunning onChange below.
    @State private var lastCardioPushWasActive = false

    var body: some View {
        Group {
            if !workoutManager.authorizationGranted {
                AuthorizationView(workoutManager: workoutManager)
            } else if let activeWorkout = phoneObserver.activeWorkout {
                // A phone-started workout takes priority: page 1 is the same
                // logging UI as the Watch-initiated flow (auto-synced sets),
                // page 0 (swipe right) is pause/finish/cancel controls, page 2
                // (swipe left) is the live HR/calorie screen.
                TabView(selection: $selectedPage) {
                    NavigationStack {
                        WorkoutControlsView(phoneObserver: phoneObserver, workoutManager: workoutManager, workout: activeWorkout)
                    }
                    .tag(0)
                    NavigationStack {
                        KraftLoggingView(phoneObserver: phoneObserver, initialWorkout: activeWorkout)
                    }
                    .tag(1)
                    NavigationStack {
                        LiveWorkoutView(workoutManager: workoutManager, phoneObserver: phoneObserver, routeTracker: routeTracker)
                    }
                    .tag(2)
                }
                .tabViewStyle(.page)
            } else if workoutManager.isRunning {
                NavigationStack {
                    LiveWorkoutView(workoutManager: workoutManager, phoneObserver: phoneObserver, routeTracker: routeTracker)
                }
            } else {
                StartView(workoutManager: workoutManager, phoneObserver: phoneObserver)
            }
        }
        .onAppear {
            workoutManager.requestAuthorization()
            // See PhoneWorkoutObserver.onActiveWorkoutCleared — fires
            // straight from the WCSession delegate callback (background-
            // capable), not gated on this view currently being rendered, so
            // a phone-initiated cancel/finish reliably ends the Watch's own
            // HR session even if the Watch app isn't in the foreground when
            // it happens.
            phoneObserver.onActiveWorkoutCleared = { wasCancelled in
                guard workoutManager.isRunning else { return }
                if wasCancelled {
                    workoutManager.cancel()
                } else {
                    workoutManager.stop()
                }
            }
            // Drives the shared WorkoutManager for a phone-initiated
            // "Cardio starten" request (see PhoneWorkoutObserver's
            // didReceiveMessage handling of "startCardio"/"stopCardio") —
            // the observer only has the WCSession plumbing, not a reference
            // to WorkoutManager, which ContentView owns.
            phoneObserver.onCardioStartRequested = { plan in
                guard workoutManager.authorizationGranted else {
                    return .failure("Keine HealthKit-Berechtigung auf der Uhr")
                }
                return await withCheckedContinuation { continuation in
                    workoutManager.start(plan: plan) { result in
                        switch result {
                        case .success:
                            continuation.resume(returning: .success(()))
                        case .failure(let message):
                            continuation.resume(returning: .failure(message))
                        }
                    }
                }
            }
            phoneObserver.onCardioStopRequested = { discard in
                if discard {
                    workoutManager.cancel()
                } else {
                    workoutManager.stop()
                }
            }
        }
        // Streams HR/calories/elapsed/zone back to the phone every single
        // second while any cardio session runs — Watch-started
        // or phone-started, it makes no difference here, so starting a run
        // directly on the Watch also lights up an active-session banner on
        // the phone, not just the reverse. elapsedSeconds already ticks
        // every 1s from WorkoutManager's own timer, so this fires on every
        // tick rather than throttling, keeping the phone's heart rate
        // reading and zone-position pointer as current as the Watch's own
        // display.
        .onChange(of: workoutManager.elapsedSeconds) { _, seconds in
            guard workoutManager.isRunning, workoutManager.isCardioActivity else { return }
            lastCardioPushWasActive = true
            phoneObserver.pushCardioLiveUpdate(
                isRunning: true,
                heartRate: workoutManager.heartRate,
                activeCalories: workoutManager.activeCalories,
                elapsedSeconds: seconds,
                zone: workoutManager.currentHeartRateZone,
                targetZone: workoutManager.activePlan?.targetZone,
                durationSeconds: workoutManager.activePlan?.durationMinutes.map { $0 * 60 },
                stepCount: workoutManager.currentActivityType == .walking ? workoutManager.stepCount : nil,
                stepGoal: workoutManager.activePlan?.stepGoal
            )
        }
        .onChange(of: workoutManager.isRunning) { wasRunning, isRunning in
            if isRunning, workoutManager.isCardioActivity {
                // Fires once immediately on start (not just the periodic
                // ticker above) so the phone's banner appears right away
                // instead of waiting up to 1s for the first tick.
                lastCardioPushWasActive = true
                phoneObserver.pushCardioLiveUpdate(
                    isRunning: true,
                    heartRate: workoutManager.heartRate,
                    activeCalories: workoutManager.activeCalories,
                    elapsedSeconds: workoutManager.elapsedSeconds,
                    zone: workoutManager.currentHeartRateZone,
                    targetZone: workoutManager.activePlan?.targetZone,
                    durationSeconds: workoutManager.activePlan?.durationMinutes.map { $0 * 60 },
                    stepCount: workoutManager.currentActivityType == .walking ? workoutManager.stepCount : nil,
                    stepGoal: workoutManager.activePlan?.stepGoal
                )
            } else if wasRunning, !isRunning, lastCardioPushWasActive {
                // By this point resetState() already cleared
                // currentActivityType, so isCardioActivity can't tell us
                // "was the session that just ended a cardio one" anymore —
                // this flag remembers it from while it was still running.
                phoneObserver.pushCardioLiveUpdate(
                    isRunning: false, heartRate: 0, activeCalories: 0, elapsedSeconds: 0, zone: nil,
                    targetZone: nil, durationSeconds: nil, stepCount: nil, stepGoal: nil
                )
                lastCardioPushWasActive = false
            }
        }
        .onChange(of: workoutManager.isRunning) { _, isRunning in
            // Route recording is tied to the HR/calorie session's own
            // lifetime rather than to a screen appearing/disappearing —
            // TabView keeps every page alive, so LiveWorkoutView's own
            // appear/disappear isn't reliable here, and this also covers
            // the phone-mirrored TabView path where the map is one swipe
            // away from the page actually shown at start.
            if isRunning, workoutManager.usesGPS {
                routeTracker.start()
            } else if !isRunning {
                routeTracker.stop()
            }
        }
        .onChange(of: workoutManager.isPaused) { _, paused in
            // GPS-Route pausiert im Gleichschritt mit der HR-Session —
            // sonst zählt die Distanz während einer Pause weiter.
            guard workoutManager.usesGPS else { return }
            if paused {
                routeTracker.pause()
            } else {
                routeTracker.resume()
            }
        }
        .onChange(of: phoneObserver.activeWorkout?.workoutId) { _, newId in
            if newId != nil {
                selectedPage = 1
                if !workoutManager.isRunning, workoutManager.authorizationGranted {
                    // Phone workout just started (or the Watch app just
                    // launched into one already running) — HR/calories track
                    // continuously for the whole session, no manual button.
                    // startedAt keeps this screen's elapsed time in sync
                    // with the phone's own timer (both count from the same
                    // server timestamp instead of each other's local clock).
                    workoutManager.start(
                        activityType: .traditionalStrengthTraining,
                        startedAt: phoneObserver.activeWorkout?.startedAtDate
                    )
                }
                // If authorization isn't granted yet, the onChange below
                // (watching authorizationGranted) starts it as soon as it is
                // — this used to fire unconditionally here, attempting to
                // create an HKWorkoutSession before HealthKit had responded
                // to the permission request. Unlike the manual Start-screen
                // buttons (structurally unreachable until authorized, since
                // ContentView shows AuthorizationView until then), this path
                // is triggered by the *phone*, which has no way to know the
                // Watch's authorization state — so it needs its own guard.
            }
            // The newId == nil case (workout finished/cancelled) is handled
            // by PhoneWorkoutObserver.onActiveWorkoutCleared, wired up in
            // .onAppear above — see its doc comment for why it isn't done
            // here.
        }
        .onChange(of: workoutManager.authorizationGranted) { _, granted in
            // Catches up on the auto-start above: if a phone workout arrived
            // before HealthKit finished responding to the permission
            // request, nothing started it. Fires once authorization lands.
            guard granted, let activeWorkout = phoneObserver.activeWorkout, !workoutManager.isRunning else { return }
            workoutManager.start(activityType: .traditionalStrengthTraining, startedAt: activeWorkout.startedAtDate)
        }
    }
}

private struct AuthorizationView: View {
    @ObservedObject var workoutManager: WorkoutManager

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "heart.text.square")
                .font(.system(size: 32))
                .foregroundStyle(.red)
            Text("FitTrack")
                .font(.headline)
            if let error = workoutManager.errorMessage {
                Text(error)
                    .font(.caption2)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            } else {
                Text("Warte auf Health-Berechtigung…")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }
}

/** Shown before every workout — including after a finished one ends and
 *  `ContentView` falls back to StartView, so the user always re-picks the
 *  type rather than the last choice sticking around. Only reached when no
 *  phone workout is active (see ContentView's TabView otherwise). */
private struct StartView: View {
    @ObservedObject var workoutManager: WorkoutManager
    @ObservedObject var phoneObserver: PhoneWorkoutObserver

    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink {
                        HealthDashboardView(workoutManager: workoutManager, phoneObserver: phoneObserver)
                    } label: {
                        Label("Health", systemImage: "heart.text.square.fill")
                    }
                }

                Section {
                    Text("Workout wählen")
                        .font(.headline)
                        .listRowBackground(Color.clear)
                }
                ForEach(WorkoutTypeOption.all) { option in
                    if option.id == .traditionalStrengthTraining {
                        // Kraft opens the custom session-picker/logging flow
                        // instead of immediately starting an HKWorkoutSession —
                        // kept independent of workoutManager so the user isn't
                        // yanked into LiveWorkoutView mid-log (see ContentView's
                        // isRunning-first Group switch).
                        NavigationLink {
                            KraftSessionPickerView(phoneObserver: phoneObserver)
                        } label: {
                            Label(option.label, systemImage: option.icon)
                        }
                    } else {
                        NavigationLink {
                            CardioConfigView(workoutManager: workoutManager, activityType: option.id, title: option.label)
                        } label: {
                            Label(option.label, systemImage: option.icon)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Reached by swiping right from KraftLoggingView (page 0 of the phone-
 * workout TabView). Lets the user pause/resume the Watch's own HR/calorie
 * tracking, finish the workout (saved on the phone, HR session saved on the
 * Watch), or cancel it entirely (deleted on the phone, HR session discarded
 * — see ContentView's onChange for how the two are told apart).
 */
private struct WorkoutControlsView: View {
    @ObservedObject var phoneObserver: PhoneWorkoutObserver
    @ObservedObject var workoutManager: WorkoutManager
    let workout: WatchActiveWorkout

    @State private var isFinishing = false
    @State private var isCancelling = false
    @State private var errorMessage: String?
    @State private var showCancelConfirm = false

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text(workout.name ?? "Training")
                    .font(.headline)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)

                if workoutManager.isRunning {
                    Button {
                        workoutManager.isPaused ? workoutManager.resume() : workoutManager.pause()
                    } label: {
                        Label(
                            workoutManager.isPaused ? "Fortsetzen" : "Pausieren",
                            systemImage: workoutManager.isPaused ? "play.fill" : "pause.fill"
                        )
                    }
                    .tint(.orange)
                }

                Button {
                    finish()
                } label: {
                    if isFinishing {
                        ProgressView()
                    } else {
                        Label("Workout beenden", systemImage: "flag.checkered")
                    }
                }
                .tint(.green)
                .disabled(isFinishing || isCancelling)

                Button(role: .destructive) {
                    showCancelConfirm = true
                } label: {
                    if isCancelling {
                        ProgressView()
                    } else {
                        Label("Workout abbrechen", systemImage: "xmark.circle")
                    }
                }
                .disabled(isFinishing || isCancelling)

                if let errorMessage {
                    Text(errorMessage)
                        .font(.caption2)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)

                    // Guaranteed escape hatch: if the phone round-trip keeps
                    // failing (unreachable, stale deploy, …), the user must
                    // still be able to leave this screen. Exits locally only —
                    // the workout stays open on the phone to deal with there.
                    Button {
                        phoneObserver.endWorkoutLocally(workout.workoutId)
                    } label: {
                        Label("Nur Uhr verlassen", systemImage: "applewatch.slash")
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Steuerung")
        .confirmationDialog(
            "Workout wirklich abbrechen?",
            isPresented: $showCancelConfirm,
            titleVisibility: .visible
        ) {
            Button("Ja, verwerfen", role: .destructive) { cancel() }
            Button("Zurück", role: .cancel) {}
        } message: {
            Text("Das Workout wird nicht gespeichert.")
        }
    }

    private func finish() {
        isFinishing = true
        errorMessage = nil
        phoneObserver.finishWorkout(workoutId: workout.workoutId) { result in
            DispatchQueue.main.async {
                isFinishing = false
                switch result {
                case .success:
                    WatchRestTimerNotifications.cancel()
                    // Leave the workout locally right away instead of waiting
                    // for the phone's context-clear push — that push depends
                    // on the phone app being frontmost and its background
                    // fetch succeeding, which isn't guaranteed mid-workout.
                    // This drives ContentView's onChange, which also
                    // stops/saves the Watch's own HR session.
                    phoneObserver.endWorkoutLocally(workout.workoutId)
                case .failure(let error):
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func cancel() {
        isCancelling = true
        errorMessage = nil
        phoneObserver.cancelWorkout(workoutId: workout.workoutId) { result in
            DispatchQueue.main.async {
                isCancelling = false
                switch result {
                case .success:
                    WatchRestTimerNotifications.cancel()
                    // Same local exit as finish() — pendingCancellation was
                    // set by cancelWorkout, so onChange discards (not saves)
                    // the Watch's HR session.
                    phoneObserver.endWorkoutLocally(workout.workoutId)
                case .failure(let error):
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
}

private struct LiveWorkoutView: View {
    @ObservedObject var workoutManager: WorkoutManager
    @ObservedObject var phoneObserver: PhoneWorkoutObserver
    @ObservedObject var routeTracker: RouteLocationTracker

    @State private var showCancelConfirm = false

    var body: some View {
        if workoutManager.usesGPS {
            // Outdoor Laufen/Radfahren: an extra swipe page shows the route covered
            // so far — indoor sessions and Kraft have nothing to map, so
            // they keep the plain metrics screen (the `else` branch below).
            TabView {
                metricsPage.tag(0)
                RouteMapView(tracker: routeTracker).tag(1)
                RouteStatsView(tracker: routeTracker, workoutManager: workoutManager).tag(2)
            }
            .tabViewStyle(.page)
        } else {
            metricsPage
        }
    }

    private var metricsPage: some View {
        // ScrollView: with the added cancel button (and possibly an error
        // block), the content can exceed the small watch screen — without
        // this, whatever ends up below the fold is simply unreachable.
        ScrollView {
        VStack(spacing: 6) {
            if let workout = phoneObserver.activeWorkout {
                Text(workout.name ?? "Training")
                    .font(.caption)
                    .lineLimit(1)
                    .foregroundStyle(.secondary)
                    .padding(.bottom, 2)
            }

            // Zones only make sense for cardio — Kraft shares this same live screen as an HR companion
            // display but aren't paced by heart-rate zones the way a run or
            // ride is.
            if workoutManager.usesHeartRateZones {
                ZoneIndicatorView(zone: workoutManager.currentHeartRateZone, heartRate: workoutManager.heartRate)
            }

            if workoutManager.currentActivityType == .walking {
                VStack(spacing: 2) {
                    Text("\(workoutManager.stepCount)")
                        .font(.system(size: 40, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(.green)
                    if let goal = workoutManager.activePlan?.stepGoal {
                        Text("Ziel: \(goal)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("Schritte")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if let alert = workoutManager.sessionAlert {
                Text(alertText(alert))
                    .font(.caption2.bold())
                    .foregroundStyle(alertColor(alert))
            }

            Text(formattedTime)
                .font(.system(size: 34, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(workoutManager.isPaused ? .orange : .primary)

            if let plan = workoutManager.activePlan, plan.targetZone != nil || plan.durationMinutes != nil {
                HStack(spacing: 6) {
                    if let target = plan.targetZone {
                        Text("Ziel: Z\(target)")
                            .foregroundStyle(ZoneIndicatorView.color(for: target))
                    }
                    if let minutes = plan.durationMinutes {
                        Text("Noch \(formattedRemaining(totalSeconds: minutes * 60))")
                            .foregroundStyle(.secondary)
                    }
                }
                .font(.caption2)
            }

            if workoutManager.isPaused {
                Text("Pausiert")
                    .font(.caption2)
                    .foregroundStyle(.orange)
            }

            HStack(spacing: 16) {
                MetricView(
                    icon: "heart.fill",
                    color: .red,
                    value: workoutManager.heartRate > 0 ? "\(Int(workoutManager.heartRate))" : "—",
                    unit: "bpm"
                )
                MetricView(
                    icon: "flame.fill",
                    color: .orange,
                    value: "\(Int(workoutManager.activeCalories))",
                    unit: "kcal"
                )
            }

            if !workoutManager.isRunning {
                // Was previously silent here — a failed beginCollection() (no
                // HealthKit authorization, a wedged session, …) tore the
                // session down without ever setting isRunning, and the user
                // just saw a permanently frozen 0:00/—/0 with zero indication
                // why. Surface it and offer to retry instead of guessing.
                VStack(spacing: 4) {
                    if let error = workoutManager.errorMessage {
                        Text(error)
                            .font(.caption2)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                    } else {
                        Text("Verbinde mit HealthKit…")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    // The only HealthKit permissions the app is ever allowed
                    // to introspect (read-only types stay opaque by design,
                    // even after being granted or denied) — shown here since
                    // Watch Settings > Health doesn't reliably list every
                    // requested category either.
                    if let debug = workoutManager.shareAuthorizationDebug {
                        Text(debug)
                            .font(.system(size: 9))
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    Button {
                        workoutManager.start(activityType: .traditionalStrengthTraining)
                    } label: {
                        Label("Erneut versuchen", systemImage: "arrow.clockwise")
                    }
                }
                .padding(.top, 4)
            }

            if phoneObserver.activeWorkout == nil {
                if workoutManager.isRunning {
                    // Pause/Resume der laufenden Cardio-Session — Kraft-
                    // Workouts haben das schon in WorkoutControlsView, hier
                    // fehlte es für Laufen/Radfahren komplett.
                    Button {
                        workoutManager.isPaused ? workoutManager.resume() : workoutManager.pause()
                    } label: {
                        Label(
                            workoutManager.isPaused ? "Fortsetzen" : "Pausieren",
                            systemImage: workoutManager.isPaused ? "play.fill" : "pause.fill"
                        )
                    }
                    .tint(.orange)
                    .padding(.top, 4)
                }

                // Only offer manual end/cancel for Watch-only sessions —
                // phone-mirrored workouts stop automatically when finished on
                // the phone (see ContentView's onChange), avoiding two
                // different "end workout" actions that could disagree.
                Button(role: .destructive) {
                    workoutManager.stop()
                } label: {
                    Label("Beenden", systemImage: "stop.fill")
                }
                .tint(.red)
                .padding(.top, 4)

                // Cancel = discard, nothing saved to HealthKit — for
                // accidental starts, where "Beenden" would pollute the
                // history with a junk workout.
                Button {
                    showCancelConfirm = true
                } label: {
                    Label("Abbrechen", systemImage: "xmark.circle")
                }
                .foregroundStyle(.secondary)
            }
        }
        .padding()
        .confirmationDialog(
            "Workout verwerfen?",
            isPresented: $showCancelConfirm,
            titleVisibility: .visible
        ) {
            Button("Ja, verwerfen", role: .destructive) { workoutManager.cancel() }
            Button("Zurück", role: .cancel) {}
        } message: {
            Text("Es wird nichts in Health gespeichert.")
        }
        }
    }

    private var formattedTime: String {
        let m = workoutManager.elapsedSeconds / 60
        let s = workoutManager.elapsedSeconds % 60
        return String(format: "%d:%02d", m, s)
    }

    private func formattedRemaining(totalSeconds: Int) -> String {
        let r = max(0, totalSeconds - workoutManager.elapsedSeconds)
        return String(format: "%d:%02d", r / 60, r % 60)
    }

    private func alertText(_ alert: WorkoutManager.CardioSessionAlert) -> String {
        switch alert {
        case .enteredTargetZone: return "Zielzone erreicht"
        case .leftTargetZone: return "Zielzone verlassen"
        case .halftime: return "Halbzeit"
        case .stepGoalReached: return "Ziel erreicht"
        }
    }

    private func alertColor(_ alert: WorkoutManager.CardioSessionAlert) -> Color {
        switch alert {
        case .enteredTargetZone: return .green
        case .leftTargetZone: return .orange
        case .halftime: return .blue
        case .stepGoalReached: return .green
        }
    }
}

/// Zone dominates (big number + German label), a 5-segment band underneath
/// gives context without the cost of an actual chart — matches Apple's own
/// Watch Heart Rate Zones screen: the *current* zone is the one thing that
/// needs to register at a glance mid-run, everything else is secondary.
private struct ZoneIndicatorView: View {
    let zone: Int?
    let heartRate: Double

    /// Where exactly within the current zone's bpm range the live reading
    /// sits — "just entered Zone 3" vs. "about to cross into Zone 4," not
    /// just the zone number itself.
    private var pointerFraction: Double? {
        guard let zone else { return nil }
        return HeartRateZones.positionWithinZone(bpm: heartRate, zone: zone)
    }

    var body: some View {
        VStack(spacing: 4) {
            if let zone {
                Text("Zone \(zone)")
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(Self.color(for: zone))
                Text(HeartRateZones.labelDe(forZone: zone))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else {
                Text("–")
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(.secondary)
                Text("Keine Zone")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: 3) {
                ForEach(1...5, id: \.self) { z in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Self.color(for: z).opacity(z == zone ? 1 : 0.25))
                            .frame(height: z == zone ? 8 : 5)
                        if z == zone, let pointerFraction {
                            GeometryReader { geo in
                                Capsule()
                                    .fill(.white)
                                    .frame(width: 2.5, height: 13)
                                    .position(x: geo.size.width * pointerFraction, y: geo.size.height / 2)
                            }
                            .animation(.easeOut(duration: 0.7), value: pointerFraction)
                        }
                    }
                }
            }
        }
        .padding(.bottom, 2)
    }

    static func color(for zone: Int) -> Color {
        switch zone {
        case 1: return .blue
        case 2: return .teal
        case 3: return .green
        case 4: return .orange
        default: return .red
        }
    }
}

private struct MetricView: View {
    let icon: String
    let color: Color
    let value: String
    let unit: String

    var body: some View {
        VStack(spacing: 2) {
            Image(systemName: icon)
                .foregroundStyle(color)
            Text(value)
                .font(.system(size: 18, weight: .semibold, design: .rounded))
                .monospacedDigit()
            Text(unit)
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
        }
    }
}

#Preview("Start") {
    ContentView()
}

#Preview("Phone-Workout (Paging)") {
    // #Preview's trailing closure is a ViewBuilder context — bare
    // assignment statements (Void-returning) directly in it get treated as
    // "this should be a View" and fail to compile, so mock-object setup
    // happens inside ordinary immediately-invoked closures instead.
    let observer: PhoneWorkoutObserver = {
        let o = PhoneWorkoutObserver()
        o.activeWorkout = WatchActiveWorkout(
            workoutId: "preview-workout-1",
            name: "Push",
            workoutExercises: [
                WatchWorkoutExercise(
                    id: "we1",
                    supersetGroup: nil,
                    exercise: WatchExerciseInfo(id: "e1", name: "Bankdrücken", muscleGroup: "Brust"),
                    sets: [
                        WatchSet(id: "set1", setNumber: 1, reps: 10, weight: 60, isCompleted: true),
                        WatchSet(id: "set2", setNumber: 2, reps: nil, weight: nil, isCompleted: false),
                    ]
                ),
            ]
        )
        return o
    }()
    let manager: WorkoutManager = {
        let m = WorkoutManager()
        m.isRunning = true
        m.heartRate = 128
        m.activeCalories = 96
        m.elapsedSeconds = 412
        return m
    }()
    TabView {
        NavigationStack { WorkoutControlsView(phoneObserver: observer, workoutManager: manager, workout: observer.activeWorkout!) }.tag(0)
        NavigationStack { KraftLoggingView(phoneObserver: observer, initialWorkout: observer.activeWorkout!) }.tag(1)
        NavigationStack { LiveWorkoutView(workoutManager: manager, phoneObserver: observer, routeTracker: RouteLocationTracker()) }.tag(2)
    }
    .tabViewStyle(.page)
}

#Preview("Live Workout (Watch-only)") {
    let manager: WorkoutManager = {
        let m = WorkoutManager()
        m.isRunning = true
        m.heartRate = 142
        m.activeCalories = 213
        m.elapsedSeconds = 754
        return m
    }()
    return NavigationStack {
        LiveWorkoutView(workoutManager: manager, phoneObserver: PhoneWorkoutObserver(), routeTracker: RouteLocationTracker())
    }
}
