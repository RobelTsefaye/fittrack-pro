//
//  CrownStepperField.swift
//  FitTrackWatch Watch App
//
//  A compact numeric field driven by the Digital Crown — tap to focus (volt
//  outline), then turn; +/- work too. Stacked vertically so two fit side by
//  side (weight + reps) without clipping the outer buttons.
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
        VStack(spacing: 3) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Theme.label2)

            Button {
                value = min(range.upperBound, value + step)
                crownValue = value
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 13, weight: .bold))
                    .frame(maxWidth: .infinity, minHeight: 22)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Theme.label2)

            Text(formattedValue)
                .font(.system(size: 26, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .foregroundStyle(isFocused ? Theme.volt : .white)

            Button {
                value = max(range.lowerBound, value - step)
                crownValue = value
            } label: {
                Image(systemName: "minus")
                    .font(.system(size: 13, weight: .bold))
                    .frame(maxWidth: .infinity, minHeight: 22)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Theme.label2)

            Text(unit)
                .font(.system(size: 10))
                .foregroundStyle(Theme.label2)
        }
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(isFocused ? Theme.volt : Color.clear, lineWidth: 1.5)
        )
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
        Fmt.weight(value)
    }
}
