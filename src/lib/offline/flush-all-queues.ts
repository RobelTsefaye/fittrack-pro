import { distinctQueuedWorkoutIds } from "./workout-offline-store";
import { flushWorkoutQueue } from "./flush-workout-queue";
import { flushBodyWeightQueue } from "./flush-body-weight-queue";

export type FlushResults = {
  workouts: Array<{ routeId: string; result: Awaited<ReturnType<typeof flushWorkoutQueue>> }>;
  bodyWeight: Awaited<ReturnType<typeof flushBodyWeightQueue>>;
};

export async function flushAllQueues(): Promise<FlushResults> {
  const ids = await distinctQueuedWorkoutIds();
  const workouts: FlushResults["workouts"] = [];
  for (const id of ids) {
    workouts.push({ routeId: id, result: await flushWorkoutQueue(id) });
  }
  const bodyWeight = await flushBodyWeightQueue();
  return { workouts, bodyWeight };
}

/** @deprecated Use flushAllQueues instead */
export async function flushAllWorkoutQueues(): Promise<FlushResults["workouts"]> {
  const r = await flushAllQueues();
  return r.workouts;
}
