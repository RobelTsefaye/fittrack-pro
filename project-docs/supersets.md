# Supersets in active workouts

Supersets are ad-hoc only: the active workout stores a shared nullable `WorkoutExercise.supersetGroup` integer. Plans are unchanged. Only adjacent exercises can be grouped from the phone; the Watch mirrors the result but does not create or dissolve groups.

After a set, there is no rest timer until the last exercise (highest workout order) in the group completes a set. Standalone exercises always start the full configured rest timer. `superset-utils.ts` and `computeRestTimerEndsAt` are the shared rest authority for phone and Watch payloads.

The phone UI renders a superset indicator and persists grouping with the offline `set_superset_group` queue operation. Watch payloads and the native Watch-offline mirror include the same field, and native replay patches it back to the server.

## Limits

- No plan-defined supersets or plan-editor changes.
- No Watch creation/dissolve UI.
- Only neighboring workout exercises can be grouped.

## Device test checklist

- Build App and Watch targets in Xcode.
- Group two exercises on the phone and confirm the Watch reflects them.
- Confirm there is no rest after a non-final partner, and full rest after the final partner.
- Start a Watch workout offline, group on the phone, reconnect, and verify the server retains the group.
- Test phone web-shell offline grouping and queued sync.
