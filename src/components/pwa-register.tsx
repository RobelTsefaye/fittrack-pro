"use client";

import { useEffect } from "react";

// Critical routes the SW should cache so the app works fully offline.
// These are fetched with auth cookies from the main thread (not SW install),
// so the cached HTML is always authenticated.
const OFFLINE_ROUTES = [
  "/workouts/new",
  "/workouts",
  "/dashboard",
  "/body-weight",
  "/exercises",
  "/records",
  "/plate-calculator",
  "/settings",
];

async function warmSwCache() {
  if (!("serviceWorker" in navigator) || !navigator.onLine) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) return;
    const routes = [...OFFLINE_ROUTES];
    // Always include the currently active workout page (if any)
    try {
      const activeUrl = localStorage.getItem("fittrack-active-workout-url");
      if (activeUrl) routes.push(activeUrl);
    } catch { /**/ }
    reg.active.postMessage({ type: "WARM_CACHE", routes });
  } catch {
    // Non-fatal
  }
}

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then(() => {
        // Warm the cache immediately once the SW is active and we're online
        if (navigator.onLine) warmSwCache();
      })
      .catch(() => {
        // SW registration failure is non-fatal
      });

    // Re-warm every time the device comes back online (keeps cache fresh)
    window.addEventListener("online", warmSwCache);
    return () => window.removeEventListener("online", warmSwCache);
  }, []);

  return null;
}
