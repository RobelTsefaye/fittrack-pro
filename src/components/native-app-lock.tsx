"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { authenticateWithBiometrics, isBiometricLockAvailable } from "@/lib/native/biometric-lock";

// Grace period before a resume re-triggers Face ID — without this, every
// brief trip out of the app (Control Center, a notification banner, quickly
// checking another app mid-workout) forced a fresh unlock. Standard
// "short-absence" grace period used by most banking/secure apps.
const REAUTH_GRACE_MS = 60_000;

/**
 * Face ID / Touch ID gate for the native app. Renders a blocking lock screen
 * over `children` until authentication succeeds — checked once on mount
 * (cold launch) and again when the app returns to the foreground after being
 * backgrounded for longer than REAUTH_GRACE_MS (@capacitor/app's
 * 'pause'/'resume' events, same reliable-foreground-detection pattern as
 * NativeHealthSync). No-ops entirely on web/PWA: isBiometricLockAvailable
 * resolves false there, so `locked` never becomes true.
 */
export function NativeAppLock({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const pausedAtRef = useRef<number | null>(null);

  const tryUnlock = useCallback(async () => {
    setAuthenticating(true);
    const success = await authenticateWithBiometrics();
    setAuthenticating(false);
    setLocked(!success);
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removePauseListener: (() => void) | undefined;
    let removeResumeListener: (() => void) | undefined;

    (async () => {
      const available = await isBiometricLockAvailable();
      setEnabled(available);
      if (!available) return;
      setLocked(true);
      await tryUnlock();
    })();

    const pauseListenerPromise = CapacitorApp.addListener("pause", () => {
      pausedAtRef.current = Date.now();
    });
    void pauseListenerPromise.then((handle) => {
      removePauseListener = () => void handle.remove();
    });

    const resumeListenerPromise = CapacitorApp.addListener("resume", () => {
      const pausedAt = pausedAtRef.current;
      pausedAtRef.current = null;
      // No recorded pause (e.g. very first resume before 'pause' ever
      // fired) — treat as "away long enough" and re-lock to be safe.
      if (pausedAt != null && Date.now() - pausedAt < REAUTH_GRACE_MS) return;
      setLocked(true);
      void tryUnlock();
    });
    void resumeListenerPromise.then((handle) => {
      removeResumeListener = () => void handle.remove();
    });

    return () => {
      removePauseListener?.();
      removeResumeListener?.();
    };
  }, [tryUnlock]);

  if (!enabled || !locked) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Lock className="h-10 w-10 text-muted-foreground" />
      <div>
        <p className="text-lg font-semibold">FitTrack Pro gesperrt</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {authenticating ? "Authentifizierung läuft…" : "Entsperre mit Face ID, um fortzufahren."}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void tryUnlock()}
        disabled={authenticating}
        className={buttonVariants({ size: "sm" })}
      >
        Erneut versuchen
      </button>
    </div>
  );
}
