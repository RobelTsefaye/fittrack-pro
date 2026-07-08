//
//  CrownStepperField.swift
//  FitTrackWatch Watch App
//
//  A compact numeric field driven by the Digital Crown, used for fast
//  weight/reps entry on the small Series 9 screen — tapping +/- works too,
//  but the Crown is the primary, fastest input method mid-set.
//

import SwiftUI

struct CrownStepperField: View {
    let label: String
    let unit: String
    @Binding var value: Double
    let step: Double
    let range: ClosedRange<Double>

    @State private var crownValue: Double = 0
    @FocusState private var isFocused: Bool

    var body: some View {
        // Vertical layout (plus / value / minus stacked) instead of the
        // previous single-row minus-value-plus: two of these side by side
        // (weight + reps) put 6 elements across in one row, which overflows
        // the screen width and clips the outer buttons — weight's minus and
        // reps' plus were unreachable. Stacking keeps each field narrow.
        VStack(spacing: 4) {
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(.secondary)

            Button {
                value = min(range.upperBound, value + step)
                crownValue = value
            } label: {
                Image(systemName: "plus.circle.fill")
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)

            Text(formattedValue)
                .font(.system(size: 20, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .frame(minWidth: 46)

            Button {
                value = max(range.lowerBound, value - step)
                crownValue = value
            } label: {
                Image(systemName: "minus.circle.fill")
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)

            Text(unit)
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
        }
        .focusable(true)
        .focused($isFocused)
        .digitalCrownRotation($crownValue, from: range.lowerBound, through: range.upperBound, by: step, sensitivity: .medium, isContinuous: false)
        .onAppear { crownValue = value }
        .onChange(of: crownValue) { _, newValue in
            value = newValue
        }
        .onTapGesture { isFocused = true }
    }

    private var formattedValue: String {
        value.truncatingRemainder(dividingBy: 1) == 0 ? String(format: "%.0f", value) : String(format: "%.1f", value)
    }
}
