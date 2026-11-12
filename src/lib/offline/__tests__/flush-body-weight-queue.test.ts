import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  listBodyWeightQueue: vi.fn(),
  removeBodyWeightQueueEntries: vi.fn(),
}));
vi.mock("@/lib/offline/body-weight-offline-store", () => store);

const { flushBodyWeightQueue } = await import("@/lib/offline/flush-body-weight-queue");

const row = (id: string, op: Record<string, unknown>) => ({ id, sort: 1, op });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  // Node >= 21 hat ein globales `navigator` ohne `onLine` (wäre "offline").
  vi.stubGlobal("navigator", { onLine: true });
  store.removeBodyWeightQueueEntries.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe("flushBodyWeightQueue", () => {
  it("offline: nichts passiert", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(flushBodyWeightQueue()).resolves.toEqual({
      ok: false,
      flushed: 0,
      error: "offline",
    });
  });

  it("leere Queue", async () => {
    store.listBodyWeightQueue.mockResolvedValue([]);
    await expect(flushBodyWeightQueue()).resolves.toEqual({ ok: true, flushed: 0 });
  });

  it("sendet post/patch/delete und entfernt alle Zeilen gesammelt am Ende", async () => {
    store.listBodyWeightQueue.mockResolvedValue([
      row("a", { t: "post", id: "c1", date: "2026-01-01", weight: 80, notes: "" }),
      row("b", { t: "delete", id: "srv1" }),
    ]);
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(flushBodyWeightQueue()).resolves.toEqual({ ok: true, flushed: 2 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ date: "2026-01-01", weight: 80 });
    expect(store.removeBodyWeightQueueEntries).toHaveBeenCalledWith(["a", "b"]);
  });

  it("IST (Datenverlust-Kandidat, KB-11): post sendet die Client-ID nicht mit; ein nachfolgendes patch auf diese ID bekommt 404 und wird verworfen", async () => {
    store.listBodyWeightQueue.mockResolvedValue([
      row("a", { t: "post", id: "client-uuid", date: "2026-01-01", weight: 80 }),
      row("b", { t: "patch", id: "client-uuid", weight: 79.2 }),
    ]);
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 404 }));
    const res = await flushBodyWeightQueue();
    expect(res).toEqual({ ok: true, flushed: 2 });
    const postBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(postBody).not.toHaveProperty("id");
    expect(postBody.weight).toBe(80); // der korrigierte Wert 79.2 erreicht den Server nie
  });

  it("Teilausfall: bereits gesendete Zeilen werden entfernt, die fehlgeschlagene bleibt", async () => {
    store.listBodyWeightQueue.mockResolvedValue([
      row("a", { t: "post", id: "c1", date: "2026-01-01", weight: 80 }),
      row("b", { t: "post", id: "c2", date: "2026-01-02", weight: 81 }),
    ]);
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }));
    await expect(flushBodyWeightQueue()).resolves.toEqual({
      ok: false,
      flushed: 1,
      error: "post_bw 500",
    });
    expect(store.removeBodyWeightQueueEntries).toHaveBeenCalledWith(["a"]);
  });

  it("KB-11 (Replay): Absturz beim Entfernen nach erfolgreichem POST; der nächste Flush sendet denselben POST erneut (Server-Upsert auf userId+date macht das idempotent)", async () => {
    const queue = [row("a", { t: "post", id: "c1", date: "2026-01-01", weight: 80, notes: "" })];
    store.listBodyWeightQueue.mockResolvedValue(queue);
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    // Prozessende/Fehler beim Entfernen: Eintrag bleibt in der Queue (try und catch rufen remove auf).
    store.removeBodyWeightQueueEntries.mockRejectedValue(new Error("idb abort"));
    await expect(flushBodyWeightQueue()).rejects.toThrow("idb abort");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    store.removeBodyWeightQueueEntries.mockReset().mockResolvedValue(undefined);
    await expect(flushBodyWeightQueue()).resolves.toEqual({ ok: true, flushed: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map((c) => c[1].body);
    expect(bodies[0]).toBe(bodies[1]);
    expect(JSON.parse(bodies[1])).toEqual({ date: "2026-01-01", weight: 80 });
  });

  it("KB-11: POST und anschliessendes DELETE werden in Queue-Reihenfolge gesendet, Entfernung erst nach der Schleife", async () => {
    store.listBodyWeightQueue.mockResolvedValue([
      row("a", { t: "post", id: "c1", date: "2026-01-01", weight: 80 }),
      row("b", { t: "delete", id: "srv1" }),
    ]);
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await flushBodyWeightQueue();
    expect(fetchMock.mock.calls.map((c) => [c[1].method, c[0]])).toEqual([
      ["POST", "/api/body-weight"],
      ["DELETE", "/api/body-weight/srv1"],
    ]);
    expect(store.removeBodyWeightQueueEntries).toHaveBeenCalledTimes(1);
  });
});
