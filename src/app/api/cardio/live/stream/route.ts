import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
// Hold the stream open up to a minute, then close cleanly and let the client
// reconnect (see MAX_STREAM_MS). Serverless platforms cap function duration,
// so we never rely on an indefinitely-open connection.
export const maxDuration = 60;

// Same staleness cutoff as the plain GET route — a snapshot older than this
// (phone force-quit / network drop with no final isRunning:false) is reported
// as not-running rather than frozen-forever.
const STALE_MS = 8_000;
// How often the server re-reads the snapshot. This is the realtime knob: an
// update reaches the client within ~one interval of the phone's POST, versus
// the old client-side poll where the client only saw it on ITS next tick.
const CHECK_INTERVAL_MS = 300;
// End the stream a little before maxDuration so we close on our terms and the
// client reconnects seamlessly instead of the platform killing it mid-write.
const MAX_STREAM_MS = 50_000;
// Comment-only keep-alive when nothing changes, so proxies don't drop an idle
// connection.
const HEARTBEAT_MS = 15_000;

type LivePayload = {
  isRunning: boolean;
  heartRate: number;
  activeCalories: number;
  elapsedSeconds: number;
  zone: number | null;
} | null;

/**
 * Server-Sent Events stream of the live cardio snapshot — the push-based
 * counterpart to GET /api/cardio/live's single read. The paired iPhone keeps
 * POSTing samples (see cardio-live-context.tsx and WatchConnectivityPlugin);
 * this endpoint watches the stored snapshot and pushes each change straight
 * to any connected device (an iPad, the web live view), so they update within
 * ~300ms of the phone instead of waiting for their own poll tick.
 *
 * Auth is cookie session OR `Authorization: Bearer <token>` (native clients),
 * both via resolveUserIdForDataApi.
 */
export async function GET(req: Request) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const encoder = new TextEncoder();
  const signal = req.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
          return true;
        } catch {
          return false; // controller already closed (client gone)
        }
      };

      // Tell EventSource clients how quickly to reconnect after we close.
      enqueue("retry: 1000\n\n");

      let lastSignature = "";
      let lastEmit = Date.now();
      const startedAt = Date.now();

      while (!signal.aborted && Date.now() - startedAt < MAX_STREAM_MS) {
        let payload: LivePayload = null;
        try {
          const snap = await prisma.cardioLiveSnapshot.findUnique({ where: { userId } });
          if (snap) {
            const stale = Date.now() - snap.updatedAt.getTime() > STALE_MS;
            payload = {
              isRunning: stale ? false : snap.isRunning,
              heartRate: snap.heartRate,
              activeCalories: snap.activeCalories,
              elapsedSeconds: snap.elapsedSeconds,
              zone: snap.zone,
            };
          }
        } catch {
          // Transient DB hiccup — keep the stream alive and retry next tick.
        }

        const signature = payload ? JSON.stringify(payload) : "null";
        if (signature !== lastSignature) {
          lastSignature = signature;
          if (!enqueue(`data: ${JSON.stringify({ data: payload })}\n\n`)) break;
          lastEmit = Date.now();
        } else if (Date.now() - lastEmit > HEARTBEAT_MS) {
          if (!enqueue(": ping\n\n")) break;
          lastEmit = Date.now();
        }

        await new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS));
      }

      try {
        controller.close();
      } catch {
        // already closed
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering so events flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
