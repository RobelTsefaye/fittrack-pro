import AppIntents

/**
 * Declaring an AppShortcutsProvider forces the App Intents metadata pipeline
 * to run and register AdjustRestTimerIntent app-wide. Without a registered
 * intent, the -15s/+15s buttons in the Live Activity render but their taps
 * never reach `perform()`. The intent itself is also compiled into this app
 * target (see project.pbxproj) so its metadata is emitted here, not only in
 * the widget extension.
 */
struct RestTimerAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AdjustRestTimerIntent(),
            phrases: ["Adjust rest timer in \(.applicationName)"],
            shortTitle: "Adjust Rest Timer",
            systemImageName: "timer"
        )
    }
}
