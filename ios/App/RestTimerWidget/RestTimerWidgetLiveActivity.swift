//
//  RestTimerWidgetLiveActivity.swift
//  RestTimerWidget
//
//  Created by Robel Tsefaye on 07.07.26.
//

import ActivityKit
import WidgetKit
import SwiftUI
import AppIntents

struct RestTimerWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerWidgetAttributes.self) { context in
            LockScreenRestTimerView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.85))
                .activitySystemActionForegroundColor(Color.white)

        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "timer")
                        .font(.title3)
                        .foregroundStyle(.orange)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    countdownText(context: context)
                        .font(.title3.monospacedDigit())
                        .foregroundStyle(.white)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 6) {
                        Text(context.attributes.title)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        adjustButtons(context: context)
                    }
                }
            } compactLeading: {
                // When another Live Activity is also running (e.g. Music),
                // the system only ever shows *this* activity's compactLeading
                // — squeezed down to a small badge — and drops compactTrailing
                // entirely. A bare icon there used to mean the countdown
                // vanished completely whenever the Island was split; showing
                // the time itself here means it survives that squeeze.
                HStack(spacing: 3) {
                    Image(systemName: "timer")
                        .foregroundStyle(.orange)
                    countdownText(context: context)
                        .font(.caption2.monospacedDigit())
                }
            } compactTrailing: {
                countdownText(context: context)
                    .font(.caption.monospacedDigit())
                    .frame(width: 42)
            } minimal: {
                Image(systemName: "timer")
                    .foregroundStyle(.orange)
            }
            .keylineTint(.orange)
        }
    }

    @ViewBuilder
    private func countdownText(context: ActivityViewContext<RestTimerWidgetAttributes>) -> some View {
        if let paused = context.state.pausedRemainingSeconds {
            Text(Self.formatSeconds(paused))
        } else {
            Text(timerInterval: Date.now...context.state.endDate, countsDown: true)
        }
    }

    /// -15s / +15s buttons — shown in the Dynamic Island expanded view and
    /// on the Lock Screen. Each runs `AdjustRestTimerIntent` in place,
    /// without opening the app (see LiveActivityIntent).
    @ViewBuilder
    fileprivate func adjustButtons(context: ActivityViewContext<RestTimerWidgetAttributes>) -> some View {
        HStack(spacing: 12) {
            Button(intent: AdjustRestTimerIntent(deltaSeconds: -15)) {
                Label("15s", systemImage: "gobackward.15")
                    .labelStyle(.iconOnly)
                    .font(.body.weight(.semibold))
            }
            .tint(.white.opacity(0.85))

            Spacer(minLength: 0)

            Button(intent: AdjustRestTimerIntent(deltaSeconds: 15)) {
                Label("15s", systemImage: "goforward.15")
                    .labelStyle(.iconOnly)
                    .font(.body.weight(.semibold))
            }
            .tint(.white.opacity(0.85))
        }
        .buttonStyle(.plain)
    }

    fileprivate static func formatSeconds(_ seconds: Int) -> String {
        String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}

private struct LockScreenRestTimerView: View {
    let context: ActivityViewContext<RestTimerWidgetAttributes>

    var body: some View {
        HStack {
            Image(systemName: "timer")
                .font(.title2)
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 2) {
                Text(context.attributes.title)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.7))
                if let paused = context.state.pausedRemainingSeconds {
                    Text(RestTimerWidgetLiveActivity.formatSeconds(paused))
                        .font(.title.monospacedDigit().bold())
                        .foregroundStyle(.white)
                } else {
                    Text(timerInterval: Date.now...context.state.endDate, countsDown: true)
                        .font(.title.monospacedDigit().bold())
                        .foregroundStyle(.white)
                }
            }
            Spacer()
            Button(intent: AdjustRestTimerIntent(deltaSeconds: -15)) {
                Label("15s", systemImage: "gobackward.15")
                    .labelStyle(.iconOnly)
                    .font(.title3.weight(.semibold))
            }
            .tint(.white.opacity(0.85))
            Button(intent: AdjustRestTimerIntent(deltaSeconds: 15)) {
                Label("15s", systemImage: "goforward.15")
                    .labelStyle(.iconOnly)
                    .font(.title3.weight(.semibold))
            }
            .tint(.white.opacity(0.85))
        }
        .buttonStyle(.plain)
        .padding()
    }
}

extension RestTimerWidgetAttributes {
    fileprivate static var preview: RestTimerWidgetAttributes {
        RestTimerWidgetAttributes(title: "Pause")
    }
}

extension RestTimerWidgetAttributes.ContentState {
    fileprivate static var running: RestTimerWidgetAttributes.ContentState {
        RestTimerWidgetAttributes.ContentState(endDate: .now.addingTimeInterval(90), pausedRemainingSeconds: nil)
    }

    fileprivate static var paused: RestTimerWidgetAttributes.ContentState {
        RestTimerWidgetAttributes.ContentState(endDate: .now, pausedRemainingSeconds: 45)
    }
}

#Preview("Notification", as: .content, using: RestTimerWidgetAttributes.preview) {
   RestTimerWidgetLiveActivity()
} contentStates: {
    RestTimerWidgetAttributes.ContentState.running
    RestTimerWidgetAttributes.ContentState.paused
}
