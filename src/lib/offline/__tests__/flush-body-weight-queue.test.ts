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

  it.todo(
    "KB-11: Entfernung erst nach der gesamten Schleife; Prozessende nach erfolgreichem POST, aber vor dem Entfernen, dupliziert Einträge - braucht echte IndexedDB/Prozessabbruch"
  );
});
