//
//  RestTimerWidgetLiveActivity.swift
//  RestTimerWidget
//
//  Created by Robel Tsefaye on 07.07.26.
//

import ActivityKit
import WidgetKit
import SwiftUI

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
                    Text(context.attributes.title)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .foregroundStyle(.orange)
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
        }
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
