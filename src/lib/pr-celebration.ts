"use client";

/** Event name the PR celebration host listens for. */
export const PR_CELEBRATION_EVENT = "fittrack:personal-record";

/**
 * Fire-and-forget: asks the mounted <PrCelebrationHost /> to play the 3D plate
 * animation. Safe to call anywhere on the client; does nothing if the host
 * isn't mounted or the user prefers reduced motion.
 */
export function celebratePersonalRecord(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PR_CELEBRATION_EVENT));
}
