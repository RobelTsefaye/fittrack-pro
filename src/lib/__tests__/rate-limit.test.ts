import { describe, expect, it } from "vitest";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("lässt max Versuche zu, dann 429-Signal mit Retry-After", () => {
    let t = 0;
    const rl = createRateLimiter({ windowMs: 60_000, max: 3, now: () => t });
    for (let i = 0; i < 3; i++) expect(rl.hit("a").ok).toBe(true);
    t = 10_000;
    const res = rl.hit("a");
    expect(res.ok).toBe(false);
    expect(res.retryAfterSec).toBe(50);
    expect(rl.hit("b").ok).toBe(true);
  });

  it("Fenster läuft ab, reset() leert den Zähler", () => {
    let t = 0;
    const rl = createRateLimiter({ windowMs: 1000, max: 1, now: () => t });
    expect(rl.hit("a").ok).toBe(true);
    expect(rl.hit("a").ok).toBe(false);
    rl.reset("a");
    expect(rl.hit("a").ok).toBe(true);
    expect(rl.hit("a").ok).toBe(false);
    t = 1500;
    expect(rl.hit("a").ok).toBe(true);
  });

  it("begrenzt die Map-Grösse (älteste Einträge fliegen raus)", () => {
    const rl = createRateLimiter({ windowMs: 60_000, max: 1, maxKeys: 3 });
    for (const k of ["a", "b", "c"]) rl.hit(k);
    rl.hit("d"); // verdrängt "a"
    expect(rl.hit("a").ok).toBe(true); // "a" war vergessen
    expect(rl.hit("c").ok).toBe(false); // "c" noch vorhanden
  });
});

describe("clientKey", () => {
  it("x-forwarded-for (erster Eintrag), dann x-real-ip, sonst unknown", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
    expect(clientKey(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientKey(new Headers())).toBe("unknown");
  });
});
