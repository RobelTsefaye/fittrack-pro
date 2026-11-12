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
  resolveWorkoutAlias: vi.fn(),
  moveQueueEntries: vi.fn(),
  deleteAliasesOf: vi.fn(),
  deleteWorkoutSnapshot: vi.fn(),
  adoptAliasQueues: vi.fn(),
}));
vi.mock("@/lib/offline/workout-offline-store", () => store);

const { flushWorkoutQueue } = await import("@/lib/offline/flush-workout-queue");

type Row = { id: string; op: Record<string, unknown> };
const row = (id: string, op: Record<string, unknown>): Row => ({ id, op });

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

/**
 * Zustandsbehaftete Queue: `listQueueForWorkout` liefert, was noch nicht entfernt wurde
 * (der Flush liest die Queue nach jedem Durchlauf erneut). `live` ist je Workout-ID
 * die aktuelle Zeilenliste; Tests können während des Flush Zeilen anhängen.
 */
let live: Record<string, Row[]>;
function queue(rows: Row[], routeId = "w1") {
  live[routeId] = [...rows];
}

let fetchMock: ReturnType<typeof vi.fn>;
const calls = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`);

beforeEach(() => {
  vi.resetAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  // Node >= 21 hat ein globales `navigator` ohne `onLine` (wäre "offline").
  vi.stubGlobal("navigator", { onLine: true });
  live = {};
  store.listQueueForWorkout.mockImplementation(async (id: string) => [...(live[id] ?? [])]);
  store.removeQueueEntries.mockImplementation(async (ids: string[]) => {
    for (const id of Object.keys(live)) live[id] = live[id].filter((r) => !ids.includes(r.id));
  });
  store.rekeyWorkoutLocalState.mockImplementation(
    async (oldId: string, newId: string, _d: unknown, _w: unknown, _s: unknown, rowId: string) => {
      live[newId] = [...(live[newId] ?? []), ...(live[oldId] ?? []).filter((r) => r.id !== rowId)];
      delete live[oldId];
    }
  );
  store.moveQueueEntries.mockImplementation(async (from: string, to: string) => {
    const moved = live[from] ?? [];
    live[to] = [...(live[to] ?? []), ...moved];
    delete live[from];
    return moved.length;
  });
  store.resolveWorkoutAlias.mockResolvedValue(null);
  store.loadQueueIdMap.mockResolvedValue({ weMap: new Map(), setMap: new Map() });
  store.loadWorkoutSnapshot.mockResolvedValue({ data: { id: "w1" }, offlineOrigin: false });
  store.saveQueueIdMap.mockResolvedValue(undefined);
  store.deleteQueueIdMap.mockResolvedValue(undefined);
  store.deleteAliasesOf.mockResolvedValue(undefined);
  store.deleteWorkoutSnapshot.mockResolvedValue(undefined);
  store.adoptAliasQueues.mockResolvedValue(0);
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

  it("leere Queue (regulärer Flush der Server-ID): räumt ID-Map und Alias-Zeilen auf", async () => {
    store.listQueueForWorkout.mockResolvedValue([]);
    await expect(flushWorkoutQueue("srv-w")).resolves.toEqual({ ok: true });
    expect(store.deleteQueueIdMap).toHaveBeenCalledWith("srv-w");
    expect(store.deleteAliasesOf).toHaveBeenCalledWith("srv-w");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leere Queue bei einer ID, die selbst einen Alias hat: nichts löschen (UI hängt noch unter der alten ID)", async () => {
    store.listQueueForWorkout.mockResolvedValue([]);
    store.resolveWorkoutAlias.mockResolvedValue("srv-w");
    await expect(flushWorkoutQueue("local-1")).resolves.toEqual({ ok: true });
    expect(store.deleteQueueIdMap).not.toHaveBeenCalled();
    expect(store.deleteAliasesOf).not.toHaveBeenCalled();
  });

  it("FT-ARCH-05: Queue ohne Snapshot (und ohne Alias) bleibt erhalten und wird als Fehler gemeldet", async () => {
    queue([row("q1", { t: "post_set", clientWeId: "a", clientSetId: "b" })]);
    store.loadWorkoutSnapshot.mockResolvedValue(null);
    await expect(flushWorkoutQueue("w1")).resolves.toEqual({ ok: false, error: "no_snapshot" });
    expect(store.removeQueueEntries).not.toHaveBeenCalled();
    expect(store.deleteQueueIdMap).not.toHaveBeenCalled();
    expect(live.w1).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offline erstelltes Workout: mappt Client-IDs auf Server-IDs und liefert die neue Workout-ID", async () => {
    store.loadWorkoutSnapshot.mockResolvedValue({ data: { id: "local-1" }, offlineOrigin: true });
    queue(
      [
        row("q1", { t: "post_workout", name: "Push" }),
        row("q2", { t: "post_exercise", exerciseId: "ex1", clientWeId: "cwe" }),
        row("q3", { t: "post_set", clientWeId: "cwe", clientSetId: "cset" }),
        row("q4", { t: "patch_set", clientSetId: "cset", body: { reps: 5 } }),
        row("q5", { t: "complete_workout" }),
      ],
      "local-1"
    );
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
    // Nach dem Rekey bleibt die ID-Zuordnung bestehen (späte Ops unter der alten ID brauchen sie).
    expect(store.deleteQueueIdMap).not.toHaveBeenCalled();
  });

  it("entfernt jede erfolgreiche Op sofort; bei Fehler bleibt nur der Rest in der Queue", async () => {
    queue([
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
    queue([row("q1", { t: "complete_workout" })]);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(flushWorkoutQueue("w1")).resolves.toMatchObject({
      ok: false,
      error: "Failed to fetch",
    });
    expect(store.removeQueueEntries).not.toHaveBeenCalled();
  });

  it("IST: patch_set mit 404 zählt als Erfolg; die Änderung geht still verloren", async () => {
    queue([row("q1", { t: "patch_set", clientSetId: "s1", body: { reps: 8, weight: 100 } })]);
    fetchMock
      .mockResolvedValueOnce(jsonRes({}, 404))
      .mockResolvedValueOnce(jsonRes({ data: { id: "w1" } }));
    const res = await flushWorkoutQueue("w1");
    expect(res.ok).toBe(true);
    expect(store.removeQueueEntries).toHaveBeenCalledWith(["q1"]);
  });

  it('delete_we toleriert 404 wie delete_set (Zustand "weg" erreicht), die Queue hängt nicht', async () => {
    queue([row("q1", { t: "delete_we", clientWeId: "we1" })]);
    fetchMock
      .mockResolvedValueOnce(jsonRes({}, 404))
      .mockResolvedValueOnce(jsonRes({ data: { id: "w1" } }));
    const res = await flushWorkoutQueue("w1");
    expect(res.ok).toBe(true);
    expect(store.removeQueueEntries).toHaveBeenCalledWith(["q1"]);
  });

  it("delete_we mit 500 bleibt ein Fehler und die Zeile in der Queue", async () => {
    queue([row("q1", { t: "delete_we", clientWeId: "we1" })]);
    fetchMock.mockResolvedValueOnce(jsonRes({}, 500));
    const res = await flushWorkoutQueue("w1");
    expect(res).toMatchObject({ ok: false, error: "delete_we 500" });
    expect(store.removeQueueEntries).not.toHaveBeenCalled();
  });

  it("KB-11 (IST): Absturz zwischen Server-Erfolg und Queue-Entfernung sendet post_set beim Retry erneut (Dublette)", async () => {
    const queued = [row("q1", { t: "post_set", clientWeId: "we1", clientSetId: "cs1" })];
    queue(queued);
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
    queue([row("q1", { t: "teleport" })]);
    await expect(flushWorkoutQueue("w1")).resolves.toMatchObject({
      ok: false,
      error: "unknown_op",
    });
  });

  describe("FT-ARCH-02: Ops während des Flush", () => {
    it("Op, die während eines Flush unter derselben ID entsteht, wird im selben Lauf gesendet und nicht vom Abschluss überschrieben", async () => {
      queue([row("q1", { t: "patch_workout", name: "A" })]);
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method === "PATCH" && live.w1.length === 1) {
          // Nutzer tippt weiter, während der erste PATCH unterwegs ist.
          live.w1.push(row("q2", { t: "patch_set", clientSetId: "s1", body: { reps: 8 } }));
        }
        return jsonRes({ data: { id: "w1" } });
      });

      const res = await flushWorkoutQueue("w1");

      expect(res.ok).toBe(true);
      expect(calls()).toEqual([
        "PATCH /api/workouts/w1",
        "PATCH /api/workouts/w1/sets/s1",
        "GET /api/workouts/w1",
      ]);
      expect(live.w1).toEqual([]);
      // Erst nach der letzten Op: ID-Map weg, Snapshot mit Serverstand.
      expect(store.deleteQueueIdMap).toHaveBeenCalledTimes(1);
    });

    it("nach dem Rekey unter der ALTEN ID angehängte Ops werden auf die neue ID umgehängt und gesendet", async () => {
      store.loadWorkoutSnapshot.mockResolvedValue({ data: { id: "local-1" }, offlineOrigin: true });
      queue(
        [
          row("q1", { t: "post_workout", name: "Push" }),
          row("q2", { t: "post_exercise", exerciseId: "ex1", clientWeId: "cwe" }),
        ],
        "local-1"
      );
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const key = `${init?.method ?? "GET"} ${url}`;
        if (key === "POST /api/workouts") return jsonRes({ data: { id: "srv-w" } });
        if (key === "POST /api/workouts/srv-w/exercises") {
          // Die UI kennt noch die alte ID und reiht dort eine Op ein (nach dem Rekey).
          live["local-1"] = [row("q3", { t: "post_set", clientWeId: "cwe", clientSetId: "cset" })];
          return jsonRes({ data: { id: "srv-we" } });
        }
        if (key === "POST /api/workouts/srv-w/exercises/srv-we/sets") {
          return jsonRes({ data: { set: { id: "srv-set" } } });
        }
        return jsonRes({ data: { id: "srv-w" } });
      });

      const res = await flushWorkoutQueue("local-1");

      expect(res).toEqual({ ok: true, newServerWorkoutId: "srv-w" });
      expect(store.moveQueueEntries).toHaveBeenCalledWith("local-1", "srv-w");
      expect(calls()).toContain("POST /api/workouts/srv-w/exercises/srv-we/sets");
      expect(live["srv-w"]).toEqual([]);
      expect(live["local-1"]).toBeUndefined();
    });

    it("späte Ops unter der alten ID (kein Snapshot mehr) werden im nächsten Flush über den Alias aufgelöst statt verworfen", async () => {
      queue([row("q9", { t: "patch_set", clientSetId: "srv-set", body: { reps: 5 } })], "local-1");
      store.loadWorkoutSnapshot.mockImplementation(async (id: string) =>
        id === "srv-w" ? { data: { id: "srv-w" }, offlineOrigin: false } : null
      );
      store.resolveWorkoutAlias.mockImplementation(async (id: string) =>
        id === "local-1" ? "srv-w" : null
      );
      fetchMock.mockResolvedValue(jsonRes({ data: { id: "srv-w" } }));

      const res = await flushWorkoutQueue("local-1");

      expect(res).toEqual({ ok: true, newServerWorkoutId: "srv-w" });
      expect(calls()[0]).toBe("PATCH /api/workouts/srv-w/sets/srv-set");
      expect(live["srv-w"]).toEqual([]);
      // Alias-Pfad: die ID-Map des Ziels und die Alias-Zeile bleiben für weitere
      // späte Ops der noch offenen alten Ansicht erhalten (Review B-3).
      expect(store.deleteQueueIdMap).not.toHaveBeenCalled();
      expect(store.deleteAliasesOf).not.toHaveBeenCalled();
    });

    it("Alias gewinnt auch, wenn unter der alten ID wieder ein Snapshot liegt (UI legt ihn bei jedem Enqueue neu an)", async () => {
      queue([row("q9", { t: "patch_workout", name: "B" })], "local-1");
      // Geister-Snapshot unter der alten ID: Offline-Origin, würde sonst als post_workout-lose Queue laufen.
      store.loadWorkoutSnapshot.mockImplementation(async (id: string) =>
        id === "srv-w"
          ? { data: { id: "srv-w" }, offlineOrigin: false }
          : { data: { id: "local-1" }, offlineOrigin: true }
      );
      store.resolveWorkoutAlias.mockImplementation(async (id: string) =>
        id === "local-1" ? "srv-w" : null
      );
      fetchMock.mockResolvedValue(jsonRes({ data: { id: "srv-w" } }));

      const res = await flushWorkoutQueue("local-1");

      expect(res).toEqual({ ok: true, newServerWorkoutId: "srv-w" });
      expect(store.moveQueueEntries).toHaveBeenCalledWith("local-1", "srv-w");
      expect(store.deleteWorkoutSnapshot).toHaveBeenCalledWith("local-1");
      expect(calls()[0]).toBe("PATCH /api/workouts/srv-w");
      expect(store.deleteQueueIdMap).not.toHaveBeenCalled();
    });

    it("R-1: regulärer Flush der Server-ID übernimmt zuerst die Ops der Alias-IDs, bevor die ID-Map gelöscht wird", async () => {
      queue([row("q1", { t: "patch_workout", name: "A" })], "srv-w");
      queue([row("q2", { t: "patch_set", clientSetId: "cset", body: { reps: 7 } })], "local-1");
      store.adoptAliasQueues.mockImplementation(async (target: string) => {
        const moved = live["local-1"] ?? [];
        live[target] = [...(live[target] ?? []), ...moved];
        delete live["local-1"];
        return moved.length;
      });
      const setMap = new Map([["cset", "srv-set"]]);
      store.loadQueueIdMap.mockResolvedValue({ weMap: new Map(), setMap });
      store.loadWorkoutSnapshot.mockResolvedValue({ data: { id: "srv-w" }, offlineOrigin: false });
      fetchMock.mockImplementation(async () => jsonRes({ data: { id: "srv-w" } }));

      const res = await flushWorkoutQueue("srv-w");

      expect(res.ok).toBe(true);
      expect(calls()).toContain("PATCH /api/workouts/srv-w/sets/srv-set");
      expect(store.adoptAliasQueues).toHaveBeenCalledWith("srv-w");
      expect(store.adoptAliasQueues.mock.invocationCallOrder[0]).toBeLessThan(
        store.deleteQueueIdMap.mock.invocationCallOrder[0]
      );
      expect(live["srv-w"]).toEqual([]);
    });

    it("zweite späte Op unter der alten ID nach einem Alias-Flush geht nicht verloren (Client-ID wird über die erhaltene Map aufgelöst)", async () => {
      store.loadWorkoutSnapshot.mockImplementation(async (id: string) =>
        id === "srv-w" ? { data: { id: "srv-w" }, offlineOrigin: false } : null
      );
      store.resolveWorkoutAlias.mockImplementation(async (id: string) =>
        id === "local-1" ? "srv-w" : null
      );
      const persisted = {
        weMap: new Map([["cwe", "srv-we"]]),
        setMap: new Map([["cset", "srv-set"]]),
      };
      store.loadQueueIdMap.mockImplementation(async (id: string) =>
        id === "srv-w" ? persisted : { weMap: new Map(), setMap: new Map() }
      );
      fetchMock.mockImplementation(async () => jsonRes({ data: { id: "srv-w" } }));

      queue([row("q1", { t: "patch_workout", name: "A" })], "local-1");
      await flushWorkoutQueue("local-1");
      queue([row("q2", { t: "patch_set", clientSetId: "cset", body: { reps: 6 } })], "local-1");
      const res = await flushWorkoutQueue("local-1");

      expect(res.ok).toBe(true);
      expect(calls()).toContain("PATCH /api/workouts/srv-w/sets/srv-set");
      expect(store.deleteQueueIdMap).not.toHaveBeenCalled();
    });

    it("regulärer Flush der Server-ID räumt ID-Map und Alias-Zeilen auf", async () => {
      queue([row("q1", { t: "patch_workout", name: "A" })], "srv-w");
      store.loadWorkoutSnapshot.mockResolvedValue({ data: { id: "srv-w" }, offlineOrigin: false });
      fetchMock.mockImplementation(async () => jsonRes({ data: { id: "srv-w" } }));
      const res = await flushWorkoutQueue("srv-w");
      expect(res.ok).toBe(true);
      expect(store.deleteQueueIdMap).toHaveBeenCalledWith("srv-w");
      expect(store.deleteAliasesOf).toHaveBeenCalledWith("srv-w");
    });

    it("Queue wächst endlos: nach MAX_ROUNDS Fehler queue_busy, Zeilen und ID-Map bleiben", async () => {
      queue([row("q0", { t: "patch_workout", name: "x" })]);
      let n = 0;
      fetchMock.mockImplementation(async () => {
        live.w1.push(row(`q${++n}`, { t: "patch_workout", name: `n${n}` }));
        return jsonRes({});
      });
      const res = await flushWorkoutQueue("w1");
      expect(res).toMatchObject({ ok: false, error: "queue_busy" });
      expect(live.w1.length).toBeGreaterThan(0);
      expect(store.deleteQueueIdMap).not.toHaveBeenCalled();
    });
  });
});
