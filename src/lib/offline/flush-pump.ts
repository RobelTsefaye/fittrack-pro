import { flushWorkoutQueue } from "./flush-workout-queue";
import { listQueueForWorkout } from "./workout-offline-store";

export const LOCAL_FIRST_WRITES = true;

type Options = { immediate?: boolean };
type PumpState = { timer?: ReturnType<typeof setTimeout>; running: boolean; retry: number };
const pumps = new Map<string, PumpState>();
const backoff = [5_000, 15_000, 30_000];

export function scheduleWorkoutFlush(workoutId: string, options: Options = {}): void {
  if (typeof window === "undefined") return;
  const state = pumps.get(workoutId) ?? { running: false, retry: 0 };
  pumps.set(workoutId, state);
  if (state.timer) clearTimeout(state.timer);
  state.retry = 0;
  state.timer = setTimeout(() => void drainWorkoutFlush(workoutId), options.immediate ? 0 : 1_500);
}

export async function drainWorkoutFlush(workoutId: string): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const state = pumps.get(workoutId) ?? { running: false, retry: 0 };
  pumps.set(workoutId, state);
  if (state.running) return;
  state.running = true;
  try {
    const result = await flushWorkoutQueue(workoutId);
    const activeId = result.newServerWorkoutId ?? workoutId;
    if (!result.ok) {
      const delay = backoff[Math.min(state.retry++, backoff.length - 1)];
      state.timer = setTimeout(() => void drainWorkoutFlush(activeId), delay);
      return;
    }
    state.retry = 0;
    if ((await listQueueForWorkout(activeId)).length > 0) scheduleWorkoutFlush(activeId, { immediate: true });
    window.dispatchEvent(new Event("fittrack-offline-synced"));
  } finally {
    state.running = false;
  }
}
