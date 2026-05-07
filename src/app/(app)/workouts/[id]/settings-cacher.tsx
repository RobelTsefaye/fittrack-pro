"use client";

import { useEffect } from "react";

const SETTINGS_KEY = "fittrack-cached-settings";

/**
 * Invisible client component that caches user settings in localStorage
 * so the offline workout start page can read them without a server fetch.
 */
export function SettingsCacher({
  weightUnit,
  restTimerDefault,
}: {
  weightUnit: string;
  restTimerDefault: number;
}) {
  useEffect(() => {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ weightUnit, restTimerDefault })
      );
    } catch {
      /* ignore */
    }
  }, [weightUnit, restTimerDefault]);

  return null;
}
