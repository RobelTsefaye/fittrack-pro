"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that counts up to `target` when it first appears or changes (ease-out,
 * ~600 ms). With reduced motion it simply shows the target.
 */
export function useCountUp(target: number, durationMs = 600): number {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  const still = typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (still) return;
    const start = performance.now();
    const begin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(begin + (target - begin) * eased);
      if (p < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, still]);

  return still ? target : value;
}
