import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGuardedPoll } from "../guarded-poll";

describe("createGuardedPoll (FT-ARCH-08)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("startet keinen zweiten Request, solange der erste läuft", async () => {
    let release!: () => void;
    const task = vi.fn(() => new Promise<void>((r) => (release = r)));
    const tick = createGuardedPoll(task, 10_000);

    const first = tick();
    expect(await tick()).toBe(false);
    expect(await tick()).toBe(false);
    expect(task).toHaveBeenCalledTimes(1);

    release();
    expect(await first).toBe(true);
  });

  it("nächster Tick läuft nach Abschluss", async () => {
    const task = vi.fn(async () => {});
    const tick = createGuardedPoll(task, 10_000);
    await tick();
    await tick();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("nächster Tick läuft auch nach fehlgeschlagener Aufgabe, ohne Fehler nach außen", async () => {
    const task = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    const tick = createGuardedPoll(task, 10_000);
    await expect(tick()).resolves.toBe(true);
    await tick();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("bricht nach dem Timeout ab, gibt den Guard frei und wirft nicht", async () => {
    let signal!: AbortSignal;
    // Aufgabe ignoriert das Signal und hängt für immer.
    const task = vi.fn((s: AbortSignal) => {
      signal = s;
      return new Promise<void>(() => {});
    });
    const tick = createGuardedPoll(task, 10_000);

    const first = tick();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(signal.aborted).toBe(false);
    expect(await tick()).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true);
    await expect(first).resolves.toBe(true);

    const second = tick();
    expect(task).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    await second;
  });

  it("abgebrochene Aufgabe (AbortError) ist kein Fehler", async () => {
    const task = vi.fn(
      (s: AbortSignal) =>
        new Promise<void>((_, reject) =>
          s.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
        )
    );
    const tick = createGuardedPoll(task, 10_000);
    const p = tick();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(p).resolves.toBe(true);
  });
});
