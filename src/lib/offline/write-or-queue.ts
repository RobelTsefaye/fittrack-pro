/**
 * "Online" is not the same as `navigator.onLine`: with the server asleep or
 * behind a broken tunnel the browser still reports online. A write that fails
 * for network/server reasons (fetch error, timeout, 5xx) must therefore land
 * in the offline queue instead of being lost.
 */

export const WRITE_TIMEOUT_MS = 10_000;

/** 5xx (incl. 502/503/504 from the tunnel or a sleeping host): worth queueing.
 *  4xx are permanent rejections and are NOT queued. */
export function isTransientWriteStatus(status: number): boolean {
  return status >= 500 && status <= 599;
}

export type WriteOutcome =
  | { kind: "response"; res: Response }
  /** The write failed transiently and was stored via the queue callback. */
  | { kind: "queued" }
  /** The write failed transiently and could not be queued (no callback, or
   *  the callback threw). The caller must tell the user. */
  | { kind: "failed"; error: unknown };

/**
 * Sends a write; on network error, timeout or 5xx runs `queue` (which must
 * persist the op locally) and reports `queued`. Non-transient responses are
 * returned untouched for the caller to evaluate.
 */
export async function writeOrQueue(
  send: (signal: AbortSignal) => Promise<Response>,
  queue?: () => Promise<void>,
  timeoutMs: number = WRITE_TIMEOUT_MS
): Promise<WriteOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response | null = null;
  let failure: unknown = null;
  try {
    res = await send(controller.signal);
  } catch (error) {
    failure = error;
  } finally {
    clearTimeout(timer);
  }
  if (res && !isTransientWriteStatus(res.status)) return { kind: "response", res };
  if (!queue) {
    return res ? { kind: "response", res } : { kind: "failed", error: failure };
  }
  try {
    await queue();
    return { kind: "queued" };
  } catch (error) {
    return { kind: "failed", error };
  }
}
