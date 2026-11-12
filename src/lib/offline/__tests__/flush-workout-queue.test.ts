import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization der Offline-Sync-Logik (KB-11: Datenverlust/Dubletten).
 * IndexedDB/Dexie wird komplett durch Mocks von `workout-offline-store` ersetzt,
 * `fetch` ist ein Stub. Getestet wird nur das Replay-Verhalten von `flushWorkoutQueue`.
 */

const store = vi.hoisted(() => ({
  listQueueForWorkout: vi.fn(),
  loadWorkoutSnapshot: vi.fn(),
  loadQueueIdMap: vi.fn(),
  saveQueueIdMap: vi.fn(),
  deleteQueueIdMap: vi.fn(),
  removeQueueEntries: vi.fn(),
  rekeyWorkoutLocalState: vi.fn(),
  saveWorkoutSnapshot: vi.fn(),
}));
vi.mock("@/lib/offline/workout-offline-store", () => store);

const { flushWorkoutQueue } = await import("@/lib/offline/flush-workout-queue");

type Row = { id: string; op: Record<string, unknown> };
const row = (id: string, op: Record<string, unknown>): Row => ({ id, op });

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

let fetchMock: ReturnType<typeof vi.fn>;
const calls = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`);

beforeEach(() => {
  vi.resetAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  // Node >= 21 hat ein globales `navigator` ohne `onLine` (wäre "offline").
  vi.stubGlobal("navigator", { onLine: true });
  store.loadQueueIdMap.mockResolvedValue({ weMap: new Map(), setMap: new Map() });
  store.loadWorkoutSnapshot.mockResolvedValue({ data: { id: "w1" }, offlineOrigin: false });
  store.removeQueueEntries.mockResolvedValue(undefined);
  store.saveQueueIdMap.mockResolvedValue(undefined);
  store.deleteQueueIdMap.mockResolvedValue(undefined);
  store.rekeyWorkoutLocalState.mockResolvedValue(undefined);
  store.saveWorkoutSnapshot.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("flushWorkoutQueue", () => {
  it("meldet offline, ohne die Queue anzufassen", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(flushWorkoutQueue("w1")).resolves.toEqual({ ok: false, error: "offline" });
    expect(store.listQueueForWorkout).not.toHaveBeenCalled();
  });

  it("leere Queue: ok ohne Netzwerkzugriff", async () => {
    store.listQueueForWorkout.mockResolvedValue([]);
    await expect(flushWorkoutQueue("w1")).resolves.toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("IST (Datenverlust-Kandidat): Queue ohne Snapshot wird still verworfen und als Erfolg gemeldet", async () => {
    store.listQueueForWorkout.mockResolvedValue([
      row("q1", { t: "post_set", clientWeId: "a", clientSetId: "b" }),
    ]);
    store.loadWorkoutSnapshot.mockResolvedValue(null);
    await expect(flushWorkoutQueue("w1")).resolves.toEqual({ ok: true });
    expect(store.removeQueueEntries).toHaveBeenCalledWith(["q1"]);
    expect(fetchMock).not.toHaveBeenCalled(); // die Ops wurden nie an den Server geschickt
  });

  it("offline erstelltes Workout: mappt Client-IDs auf Server-IDs und liefert die neue Workout-ID", async () => {
    store.loadWorkoutSnapshot.mockResolvedValue({ data: { id: "local-1" }, offlineOrigin: true });
    store.listQueueForWorkout.mockResolvedValue([
      row("q1", { t: "post_workout", name: "Push" }),
      row("q2", { t: "post_exercise", exerciseId: "ex1", clientWeId: "cwe" }),
      row("q3", { t: "post_set", clientWeId: "cwe", clientSetId: "cset" }),
      row("q4", { t: "patch_set", clientSetId: "cset", body: { reps: 5 } }),
      row("q5", { t: "complete_workout" }),
    ]);
    fetchMock
      .mockResolvedValueOnce(jsonRes({ data: { id: "srv-w" } }))
      .mockResolvedValueOnce(jsonRes({ data: { id: "srv-we" } }))
      .mockResolvedValueOnce(jsonRes({ data: { set: { id: "srv-set" } } }))
      .mockResolvedValueOnce(jsonRes({}))
      .mockResolvedValueOnce(jsonRes({}))
      .mockResolvedValueOnce(jsonRes({ data: { id: "srv-w" } }));

    const res = await flushWorkoutQueue("local-1");

    expect(res).toEqual({ ok: true, newServerWorkoutId: "srv-w" });
    expect(calls()).toEqual([
      "POST /api/workouts",
      "POST /api/workouts/srv-w/exercises",
      "POST /api/workouts/srv-w/exercises/srv-we/sets",
      "PATCH /api/workouts/srv-w/sets/srv-set",
      "POST /api/workouts/srv-w/complete",
      "GET /api/workouts/srv-w",
    ]);
    expect(store.rekeyWorkoutLocalState).toHaveBeenCalledTimes(1);
    expect(store.deleteQueueIdMap).toHaveBeenCalledWith("srv-w");
  });

  it("entfernt jede erfolgreiche Op sofort; bei Fehler bleibt nur der Rest in der Queue", async () => {
    store.listQueueForWorkout.mockResolvedValue([
      row("q1", { t: "patch_workout", name: "A" }),
      row("q2", { t: "patch_workout", name: "B" }),
    ]);
    fetchMock.mockResolvedValueOnce(jsonRes({})).mockResolvedValueOnce(jsonRes({}, 500));

    const res = await flushWorkoutQueue("w1");

    expect(res).toEqual({ ok: false, error: "patch_workout 500", newServerWorkoutId: undefined });
    expect(store.removeQueueEntries).toHaveBeenCalledTimes(1);
    expect(store.removeQueueEntries).toHaveBeenCalledWith(["q1"]);
  });

  it("Netzwerkfehler (fetch rejects) wird als Fehlerergebnis gemeldet, nicht geworfen", async () => {
    store.listQueueForWorkout.mockResolvedValue([row("q1", { t: "complete_workout" })]);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(flushWorkoutQueue("w1")).resolves.toMatchObject({
      ok: false,
      error: "Failed to fetch",
    });
    expect(store.removeQueueEntries).not.toHaveBeenCalled();
  });

  it("IST: patch_set mit 404 zählt als Erfolg; die Änderung geht still verloren", async () => {
    store.listQueueForWorkout.mockResolvedValue([
      row("q1", { t: "patch_set", clientSetId: "s1", body: { reps: 8, weight: 100 } }),
    ]);
    fetchMock
      .mockResolvedValueOnce(jsonRes({}, 404))
      .mockResolvedValueOnce(jsonRes({ data: { id: "w1" } }));
    const res = await flushWorkoutQueue("w1");
    expect(res.ok).toBe(true);
    expect(store.removeQueueEntries).toHaveBeenCalledWith(["q1"]);
  });

  it("IST (Inkonsistenz): delete_set toleriert 404, delete_we nicht und blockiert die Queue dauerhaft", async () => {
    store.listQueueForWorkout.mockResolvedValue([row("q1", { t: "delete_we", clientWeId: "we1" })]);
    fetchMock.mockResolvedValueOnce(jsonRes({}, 404));
    const res = await flushWorkoutQueue("w1");
    expect(res).toMatchObject({ ok: false, error: "delete_we 404" });
    expect(store.removeQueueEntries).not.toHaveBeenCalled();
  });

  it("KB-11 (IST): Absturz zwischen Server-Erfolg und Queue-Entfernung sendet post_set beim Retry erneut (Dublette)", async () => {
    const queued = [row("q1", { t: "post_set", clientWeId: "we1", clientSetId: "cs1" })];
    store.listQueueForWorkout.mockResolvedValue(queued);
    store.removeQueueEntries.mockRejectedValueOnce(new Error("IndexedDB aborted"));
    fetchMock
      .mockResolvedValueOnce(jsonRes({ data: { set: { id: "srv-set-1" } } }))
      .mockResolvedValueOnce(jsonRes({ data: { set: { id: "srv-set-2" } } }))
      .mockResolvedValue(jsonRes({ data: { id: "w1" } }));

    const first = await flushWorkoutQueue("w1");
    expect(first.ok).toBe(false);
    const second = await flushWorkoutQueue("w1");
    expect(second.ok).toBe(true);

    const setPosts = calls().filter((c) => c === "POST /api/workouts/w1/exercises/we1/sets");
    // Kein Idempotenz-Schlüssel (clientSetId wird nicht mitgesendet): zwei Sätze serverseitig.
    expect(setPosts).toHaveLength(2);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({});
  });

  it("unbekannte Op bricht mit unknown_op ab", async () => {
    store.listQueueForWorkout.mockResolvedValue([row("q1", { t: "teleport" })]);
    await expect(flushWorkoutQueue("w1")).resolves.toMatchObject({
      ok: false,
      error: "unknown_op",
    });
  });

  it.todo(
    "KB-11: Statusanzeige 'synchronisiert' bei verworfener Queue (kein Snapshot) - UI-Zustand in Komponenten, ohne DOM-Umgebung nicht testbar"
  );
});
