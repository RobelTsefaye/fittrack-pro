# Online instant-write roadmap

## Status

In progress — local-first writes, 180-second default, and background flush pump are implemented.

## Resume here

Run the full browser and on-device verification matrix before merge.

## Phases

- [x] 180-second rest-timer default, schema migration, and client fallbacks
- [x] Workout queue flush pump, rekey/PR/completion events, and plan-session replay fix
- [x] Active workout mutations use the established local queue online
- [x] Manual and plan start flows use local construction first
- [ ] Browser and iPhone/Watch regression verification

## Design decisions

- Writes update the IndexedDB snapshot first; a per-workout, debounced pump replays them online.
- Pump errors retry silently with bounded backoff; visible errors remain reserved for explicit user actions.
- A rekey map makes in-flight writes follow a UUID's server id.

## Log

- 2026-07-16: Created branch `feature/instant-online-writes`; added the implementation described above.
