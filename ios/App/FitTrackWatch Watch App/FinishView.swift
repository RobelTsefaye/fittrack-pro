//
//  FinishView.swift
//  FitTrackWatch Watch App
//
//  After a finished session: what it amounted to, and — after a plan day
//  flagged "Cardio danach" (e.g. Calves + forearms) — the cardio offer:
//  treadmill, indoor bike or elliptical, one tap starts it right here in
//  FitTrack. The phone's finish summary offers the same three.
//

import SwiftUI

struct FinishView: View {
    @ObservedObject var coordinator: WatchCoordinator
    let summary: FinishSummary

    @State private var minutes: Int?

    private static let durations: [Int?] = [nil, 20, 30, 45]

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                header

                LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)], spacing: 6) {
                    if let duration = summary.durationSeconds {
                        stat("Dauer", Fmt.clock(duration))
                    }
                    if let sets = summary.completedSets {
                        stat("Sätze", "\(sets)")
                    }
                    if let volume = summary.volume, volume > 0 {
                        stat("Volumen", Fmt.volume(volume))
                    }
                    if let distance = summary.distanceMeters {
                        stat("Distanz", String(format: "%.2f km", distance / 1000).replacingOccurrences(of: ".", with: ","))
                    }
                    if let kcal = summary.activeCalories, kcal > 0 {
                        stat("Kalorien", "\(Int(kcal)) kcal")
                    }
                    if let hr = summary.averageHeartRate {
                        stat("Ø Puls", "\(Int(hr.rounded()))")
                    }
                }

                if summary.offersCardio {
                    cardioOffer
                }

                if summary.offersCardio {
                    Button {
                        coordinator.dismissFinish()
                    } label: {
                        Text("Nein, fertig")
                            .font(.system(size: 15, weight: .medium))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(TileButtonStyle())
                    .padding(.top, 4)
                } else {
                    Button("Fertig") {
                        coordinator.dismissFinish()
                    }
                    .buttonStyle(VoltButtonStyle())
                    .padding(.top, 4)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private var header: some View {
        VStack(spacing: 4) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 30))
                .foregroundStyle(Theme.volt)
            Text(summary.title)
                .font(.system(size: 17, weight: .bold, design: .rounded))
                .multilineTextAlignment(.center)
                .lineLimit(2)
            Text(summary.kind == .strength ? "Training gespeichert" : "In Health gespeichert")
                .font(.footnote)
                .foregroundStyle(Theme.label2)
        }
        .frame(maxWidth: .infinity)
    }

    private var cardioOffer: some View {
        VStack(alignment: .leading, spacing: 6) {
            Eyebrow(text: "Cardio dranhängen?", color: Theme.volt)
                .padding(.top, 6)
            ForEach(CardioKind.afterStrength) { kind in
                Button {
                    coordinator.startCardio(kind, minutes: minutes)
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: kind.icon)
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Theme.volt)
                            .frame(width: 26)
                        Text(kind.title)
                            .font(.system(size: 15, weight: .semibold))
                        Spacer(minLength: 0)
                        Image(systemName: "play.fill")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.volt)
                    }
                }
                .buttonStyle(TileButtonStyle())
            }
            HStack(spacing: 4) {
                ForEach(Self.durations, id: \.self) { value in
                    Button {
                        minutes = value
                    } label: {
                        Text(value.map { "\($0)′" } ?? "Frei")
                            .font(.system(size: 13, weight: .semibold))
                            .monospacedDigit()
                            .frame(maxWidth: .infinity, minHeight: 30)
                            .foregroundStyle(minutes == value ? Theme.voltInk : .white)
                            .background(minutes == value ? Theme.volt : Theme.raised, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            Text(minutes.map { "Endet automatisch nach \($0) min." } ?? "Läuft, bis du beendest.")
                .font(.system(size: 11))
                .foregroundStyle(Theme.label2)
        }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Theme.label2)
            Text(value)
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}
