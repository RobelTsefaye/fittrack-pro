//
//  RestTimerWidgetLiveActivity.swift
//  RestTimerWidget
//
//  Created by Robel Tsefaye on 07.07.26.
//

import ActivityKit
import WidgetKit
import SwiftUI

struct RestTimerWidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic stateful properties about your activity go here!
        var emoji: String
    }

    // Fixed non-changing properties about your activity go here!
    var name: String
}

struct RestTimerWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerWidgetAttributes.self) { context in
            // Lock screen/banner UI goes here
            VStack {
                Text("Hello \(context.state.emoji)")
            }
            .activityBackgroundTint(Color.cyan)
            .activitySystemActionForegroundColor(Color.black)

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI goes here.  Compose the expanded UI through
                // various regions, like leading/trailing/center/bottom
                DynamicIslandExpandedRegion(.leading) {
                    Text("Leading")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("Trailing")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Bottom \(context.state.emoji)")
                    // more content
                }
            } compactLeading: {
                Text("L")
            } compactTrailing: {
                Text("T \(context.state.emoji)")
            } minimal: {
                Text(context.state.emoji)
            }
            .widgetURL(URL(string: "http://www.apple.com"))
            .keylineTint(Color.red)
        }
    }
}

extension RestTimerWidgetAttributes {
    fileprivate static var preview: RestTimerWidgetAttributes {
        RestTimerWidgetAttributes(name: "World")
    }
}

extension RestTimerWidgetAttributes.ContentState {
    fileprivate static var smiley: RestTimerWidgetAttributes.ContentState {
        RestTimerWidgetAttributes.ContentState(emoji: "😀")
     }
     
     fileprivate static var starEyes: RestTimerWidgetAttributes.ContentState {
         RestTimerWidgetAttributes.ContentState(emoji: "🤩")
     }
}

#Preview("Notification", as: .content, using: RestTimerWidgetAttributes.preview) {
   RestTimerWidgetLiveActivity()
} contentStates: {
    RestTimerWidgetAttributes.ContentState.smiley
    RestTimerWidgetAttributes.ContentState.starEyes
}
