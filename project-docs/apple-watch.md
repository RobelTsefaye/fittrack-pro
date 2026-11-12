# Apple Watch app

`ios/App/FitTrackWatch Watch App` (SwiftUI, watchOS 26.5, synchronized folder — new files are in the target automatically). The phone side lives in `ios/App/App/WatchConnectivityPlugin.swift` (bridge), `WatchAPIProxy.swift` (answers the Watch natively, also offline and with the phone app closed) and `src/lib/native/watch-*.ts` (JS fallback while the app is open).

## Screens (ContentView decides, top to bottom)

| State | Screen |
|-------|--------|
| No Health permission yet | AuthorizationView |
| A strength workout is active on the phone | `StrengthSessionView`: swipe right = controls (pause HR, finish, discard), middle = logging, swipe left = live HR/kcal |
| A session runs on the Watch | `SessionLiveView`: controls · metrics (time, HR in zone colour, kcal, distance/steps, zone bar, remaining) · map + route stats for outdoor |
| Just finished | `FinishView`: duration, sets, volume, kcal, Ø HR — plus the cardio offer after a day with "Cardio danach" |
| Otherwise | `HomeView`: today's plan day (weekdays, same rule as the phone's workouts page) with one-tap start, cardio tiles, all days, Health |

Logging (`KraftLoggingView`): time + sets done, rest countdown (±15 s, synced with phone bar and Live Activity), **"Jetzt" card** with the next set (supersets alternate A1, B1, A2 …) — one tap logs the proposal, "Anpassen" opens the Crown entry (`SetEntryView`) — then every exercise with its sets and **"+ Satz"**.

Proposal for a set (same order as the phone): logged value → the phone's progression suggestion (`suggestProgression`, double progression within the plan's rep range) → last time → the set above → 20 kg × 10.

Design: the phone's dark "Volt" palette (`WatchTheme.swift`): volt `#D4FF3A` for the main action, `#121214` / `#26262B` surfaces, day colours from `split-hue.ts`, zone colours from the phone's cardio page.

## Cardio after a strength day ("Cardio danach")

`PlanSession.cardioAfter` (plan editor toggle; the migration switched it on for days named like "calves"). After finishing such a day:

- **Phone**: the finish summary (and the finished workout page for 3 h) shows treadmill / indoor bike / elliptical + duration. A tap opens `/workouts/cardio?start=…&indoor=1&minutes=…`, which starts the session in the FitTrack Watch app and shows it live.
- **Watch**: the finish screen offers the same three; a tap starts it right there.

Sessions are recorded by FitTrack on the Watch (`HKWorkoutSession`, indoor running / indoor cycling / elliptical) and saved to Health — they appear in Apple Fitness and, after the HealthKit sync, in FitTrack's cardio list.

## Starting from the phone

`WatchConnectivity.startCardioSession` → if the Watch app is reachable: message `startCardio`. Otherwise `HKHealthStore.startWatchApp(with:)` launches it; `WKApplicationDelegate.handle(_:)` (`FitTrackWatchApp.swift`) starts the session immediately, the follow-up `startCardio` (duration/zone) is adopted by the running session. If the Watch stays unreachable for 10 s, the plan is queued as `applyCardioPlan` (transferUserInfo) and the phone shows the live view, which fills with the first sample.

`WatchCoordinator` wires all of this at launch (not in a view), so it also works with the screen off or the app launched in the background. watchOS crash relaunch: `handleActiveWorkoutRecovery` reattaches the running session.

## Messages

| Direction | Type | Purpose |
|-----------|------|---------|
| Watch → phone (reply) | `startSession`, `logSet`, `addSet`, `adjustRestTimer`, `finishWorkout`, `cancelWorkout`, `refreshRecovery` | Strength workout + recovery; replies may carry `workoutJSON` |
| Phone → Watch (reply) | `startCardio`, `stopCardio` | Remote cardio control |
| Phone → Watch (context) | `activeWorkout`, `planCatalog`, `recoveryScore` | Latest state |
| Phone → Watch (userInfo) | `workoutCleared`, `stopCardio`, `applyCardioPlan` | Guaranteed delivery |
| Watch → phone (message) | `cardioLiveUpdate` | HR/kcal/zone every second |
| Watch → phone (userInfo) | `cardioSaved` | Sync the new HealthKit workout now |

Workout payload (`toWatchWorkoutPayload` in TS, `buildWatchWorkoutPayload` in `WatchAPIProxy.swift` — keep both in step): `planSessionId`, `cardioAfter`, `restTimerEndsAt` (per-exercise rest wins over the default), exercises with `repMin`/`repMax`, sets in display order (warm-ups first) with `previousWeight/Reps` and `suggestedWeight/Reps`.

## Sync polling (Audit 2026-11)

The phone's workout screen picks up Watch-logged sets through a 1 s poll. It runs through `createGuardedPoll` (`src/lib/guarded-poll.ts`): no overlapping ticks, 10 s abort. While a write is waiting in the offline queue the screen works on its local copy, so Watch sets only appear after the next flush (see `offline-first-roadmap.md`, "Audit 2026-11").
