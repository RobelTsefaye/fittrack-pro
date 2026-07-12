/**
 * Last-known user identity for display purposes (greeting, More-page
 * profile). On native, next-auth's `useSession()` depends on the WKWebView
 * cookie jar, which is only best-effort synced (see the Phase 2 notes in
 * project-docs/offline-first-roadmap.md) — the cookie session can silently
 * die while the Bearer token stays valid, leaving `session` null and every
 * name/email display blank even though the user is fully logged in.
 *
 * Written from the two places the identity reliably passes through: the
 * native-login response (name + email) and the dashboard client-payload
 * (name). Display-only — never used for auth decisions.
 */

const KEY = "fittrack-cached-user";

export type CachedUser = { name?: string | null; email?: string | null };

export function loadCachedUser(): CachedUser {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as CachedUser;
  } catch {
    return {};
  }
}

export function saveCachedUser(patch: CachedUser): void {
  try {
    const merged = { ...loadCachedUser(), ...patch };
    window.localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    // storage unavailable — displays just fall back to their placeholders
  }
}
