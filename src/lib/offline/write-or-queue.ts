/**
 * "Online" is not the same as `navigator.onLine`: with the server asleep or
 * behind a broken tunnel the browser still reports online. A write that fails
 * for network/server reasons (fetch error, timeout, 5xx) must therefore land
 * in the offline queue instead of being lost.
 */

export const WRITE_TIMEOUT_MS = 10_000;

/** 502/503/504 (gateway, tunnel or host gone): worth queueing. A plain 500 is
 *  deterministic (app bug, missing DB column) and would block the queue for
 *  good, so it is NOT queued; neither are 4xx (permanent rejections). */
export function isTransientWriteStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

/** 502/503: gateway, tunnel or host is gone, the request most likely never
 *  reached the app. */
export function isGatewayDownStatus(status: number): boolean {
  return status === 502 || status === 503;
}

export type WriteOptions = {
  /** Client timeout in ms; `null` disables it (no abort, wait for the server). */
  timeoutMs?: number | null;
  /** Which response statuses are queued instead of returned. */
  queueStatus?: (status: number) => boolean;
};

/**
 * Options for POSTs that CREATE something (not idempotent: no client id yet,
 * FT-ARCH-03). A client-side abort or a 500/504 does not prove the server did
 * not apply the op, and a replay would duplicate it. So: no timeout, and queue
 * only on a real network error (fetch throws) or 502/503. Everything else is
 * returned to the caller, which must tell the user.
 */
export const CREATE_WRITE: WriteOptions = { timeoutMs: null, queueStatus: isGatewayDownStatus };

export type WriteOutcome =
  | { kind: "response"; res: Response }
  /** The write failed transiently and was stored via the queue callback. */
  | { kind: "queued" }
  /** The write failed transiently and could not be queued (no callback, or
   *  the callback threw). The caller must tell the user. */
  | { kind: "failed"; error: unknown };

/**
 * Sends a write; on network error, timeout or 502/503/504 runs `queue` (which must
 * persist the op locally) and reports `queued`. Non-transient responses are
 * returned untouched for the caller to evaluate.
 */
export async function writeOrQueue(
  send: (signal: AbortSignal) => Promise<Response>,
  queue?: () => Promise<void>,
  options: WriteOptions = {}
): Promise<WriteOutcome> {
  // The timeout only makes sense with a queue fallback: without one an abort
  // would turn a slow success into a failure (old behavior: wait).
  const { timeoutMs = queue ? WRITE_TIMEOUT_MS : null, queueStatus = isTransientWriteStatus } =
    options;
  const controller = new AbortController();
  const timer = timeoutMs === null ? null : setTimeout(() => controller.abort(), timeoutMs);
  let res: Response | null = null;
  let failure: unknown = null;
  try {
    res = await send(controller.signal);
  } catch (error) {
    failure = error;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
  if (res && !queueStatus(res.status)) return { kind: "response", res };
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
