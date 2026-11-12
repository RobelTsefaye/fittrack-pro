import { afterEach, describe, expect, it, vi } from "vitest";
import { CREATE_WRITE, isTransientWriteStatus, writeOrQueue } from "@/lib/offline/write-or-queue";

/**
 * FT-ARCH-01: "online" ist nicht gleich `navigator.onLine`. Schlägt ein Schreibversuch
 * wegen Netz/Server fehl, wird die Op in die Offline-Queue geschrieben statt verworfen.
 */

const res = (status: number) => new Response("{}", { status });

afterEach(() => {
  vi.useRealTimers();
});

describe("isTransientWriteStatus", () => {
  it("5xx ist transient, 2xx/4xx nicht", () => {
    for (const s of [500, 502, 503, 504]) expect(isTransientWriteStatus(s)).toBe(true);
    for (const s of [200, 204, 400, 401, 404, 409, 422])
      expect(isTransientWriteStatus(s)).toBe(false);
  });
});

describe("writeOrQueue", () => {
  it("Erfolg: Antwort durchreichen, nichts einreihen", async () => {
    const queue = vi.fn().mockResolvedValue(undefined);
    const out = await writeOrQueue(async () => res(200), queue);
    expect(out.kind).toBe("response");
    expect(queue).not.toHaveBeenCalled();
  });

  it("fetch rejects (Funnel/Mac weg, navigator.onLine lügt): Op wird eingereiht", async () => {
    const queue = vi.fn().mockResolvedValue(undefined);
    const out = await writeOrQueue(async () => {
      throw new TypeError("Failed to fetch");
    }, queue);
    expect(out).toEqual({ kind: "queued" });
    expect(queue).toHaveBeenCalledTimes(1);
  });

  it.each([500, 502, 503, 504])("HTTP %i: Op wird eingereiht", async (status) => {
    const queue = vi.fn().mockResolvedValue(undefined);
    const out = await writeOrQueue(async () => res(status), queue);
    expect(out).toEqual({ kind: "queued" });
    expect(queue).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 404, 409])(
    "HTTP %i (permanent): nicht einreihen, Antwort an den Aufrufer",
    async (status) => {
      const queue = vi.fn().mockResolvedValue(undefined);
      const out = await writeOrQueue(async () => res(status), queue);
      expect(out.kind).toBe("response");
      expect(queue).not.toHaveBeenCalled();
    }
  );

  it("Timeout: Anfrage wird abgebrochen und die Op eingereiht", async () => {
    vi.useFakeTimers();
    const queue = vi.fn().mockResolvedValue(undefined);
    const pending = writeOrQueue(
      (signal) =>
        new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
      queue,
      { timeoutMs: 1000 }
    );
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual({ kind: "queued" });
    expect(queue).toHaveBeenCalledTimes(1);
  });

  it("Einreihen schlägt fehl (IndexedDB): failed, damit der Aufrufer es melden kann", async () => {
    const boom = new Error("IndexedDB aborted");
    const out = await writeOrQueue(
      async () => {
        throw new TypeError("Failed to fetch");
      },
      async () => {
        throw boom;
      }
    );
    expect(out).toEqual({ kind: "failed", error: boom });
  });

  it("ohne Queue-Callback: Netzfehler = failed, 5xx = Antwort (Verhalten wie bisher)", async () => {
    const net = await writeOrQueue(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(net.kind).toBe("failed");
    const srv = await writeOrQueue(async () => res(503));
    expect(srv.kind).toBe("response");
  });
});

describe("writeOrQueue mit CREATE_WRITE (nicht-idempotente POSTs)", () => {
  it("kein Client-Timeout: wartet länger als 10 s und reiht NICHT ein", async () => {
    vi.useFakeTimers();
    const queue = vi.fn().mockResolvedValue(undefined);
    let aborted = false;
    const pending = writeOrQueue(
      (signal) =>
        new Promise<Response>((resolve) => {
          signal.addEventListener("abort", () => (aborted = true));
          setTimeout(() => resolve(res(200)), 60_000);
        }),
      queue,
      CREATE_WRITE
    );
    await vi.advanceTimersByTimeAsync(60_000);
    const out = await pending;
    expect(aborted).toBe(false);
    expect(out.kind).toBe("response");
    expect(queue).not.toHaveBeenCalled();
  });

  it("fetch rejects (echter Netzwerkfehler): eingereiht", async () => {
    const queue = vi.fn().mockResolvedValue(undefined);
    const out = await writeOrQueue(
      async () => {
        throw new TypeError("Failed to fetch");
      },
      queue,
      CREATE_WRITE
    );
    expect(out).toEqual({ kind: "queued" });
  });

  it.each([502, 503])("HTTP %i: eingereiht", async (status) => {
    const queue = vi.fn().mockResolvedValue(undefined);
    const out = await writeOrQueue(async () => res(status), queue, CREATE_WRITE);
    expect(out).toEqual({ kind: "queued" });
    expect(queue).toHaveBeenCalledTimes(1);
  });

  it.each([500, 504])(
    "HTTP %i: NICHT eingereiht, Antwort geht an den Aufrufer (Hinweis, kein stilles Verwerfen)",
    async (status) => {
      const queue = vi.fn().mockResolvedValue(undefined);
      const out = await writeOrQueue(async () => res(status), queue, CREATE_WRITE);
      expect(out.kind).toBe("response");
      expect(queue).not.toHaveBeenCalled();
    }
  );
});
