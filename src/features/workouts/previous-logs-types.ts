/**
 * Shared response shape for GET /api/workouts/[id]/previous-logs — pulled out
 * of the route file itself so client code (workout-detail.tsx,
 * watch-connectivity.ts, watch-workout-sync.ts) can import the type without
 * pulling in the whole route module. This matters specifically for the
 * native static-export build (project-docs/offline-first-roadmap.md Phase 2,
 * scripts/build-native.mjs): `src/app/api` is physically moved out of the
 * source tree for that build, so a type-only import reaching into
 * `@/app/api/...` would fail to resolve.
 */
export type PreviousSetEntry = {
  setNumber: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
};

/** Per exercise: ordered array of working sets from the previous session. */
export type PreviousLogEntry = PreviousSetEntry[] | null;
