//
//  RestTimerWidgetBundle.swift
//  RestTimerWidget
//
//  Created by Robel Tsefaye on 07.07.26.
//

import WidgetKit
import SwiftUI

@main
struct RestTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        RestTimerWidget()
        RestTimerWidgetControl()
        RestTimerWidgetLiveActivity()
        RecoveryScoreWidget()
        NextWorkoutWidget()
    }
}
