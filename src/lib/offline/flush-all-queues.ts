import { distinctQueuedWorkoutIds } from "./workout-offline-store";
import { flushWorkoutQueue } from "./flush-workout-queue";

export async function flushAllWorkoutQueues(): Promise<
  Array<{ routeId: string; result: Awaited<ReturnType<typeof flushWorkoutQueue>> }>
> {
  const ids = await distinctQueuedWorkoutIds();
  const out: Array<{ routeId: string; result: Awaited<ReturnType<typeof flushWorkoutQueue>> }> = [];
  for (const id of ids) {
    out.push({ routeId: id, result: await flushWorkoutQueue(id) });
  }
  return out;
}
