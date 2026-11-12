import { NextResponse } from "next/server";
import { createRateLimiter, type RateLimiter } from "@/lib/rate-limit";

const WINDOW_MS = 15 * 60 * 1000;

// Next kann jede Route in einem eigenen Modul-Graphen bündeln; ein Zähler auf globalThis
// sorgt dafür, dass native-login und der NextAuth-Login denselben Zähler teilen.
const store = globalThis as unknown as { __ftAuthLimiters?: Record<string, RateLimiter> };
const limiters = (store.__ftAuthLimiters ??= {});

function limiter(name: string, max: number): RateLimiter {
  return (limiters[name] ??= createRateLimiter({ windowMs: WINDOW_MS, max }));
}

/** Registrierung: 10 Versuche / 15 min pro Client-IP. */
export const registerLimiter = () => limiter("register", 10);

/**
 * Login (NextAuth Credentials + native-login): 20 Versuche / 15 min pro Client-IP.
 * Grosszügig, weil hinter dem Funnel die IP für alle gleich sein kann.
 */
export const loginLimiter = () => limiter("login", 20);

export function tooManyRequests(retryAfterSec: number) {
  return NextResponse.json(
    { error: "Too many attempts. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}
