"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { loadNativeAuthToken } from "@/lib/native/native-auth-token";

/**
 * TEMPORARY on-screen diagnostic (Phase 3 offline debugging). Shows ground
 * truth the app itself sees — navigator.onLine, whether a Keychain token is
 * present, current route — directly on screen so it can be screenshotted
 * without needing an attached Xcode console (which airplane mode kills for
 * wireless debugging, and which a USB cable may itself restore network
 * access through, defeating an airplane-mode test). Remove once the offline
 * login issue is resolved.
 */
export function NativeDebugOverlay() {
  const pathname = usePathname();
  const [onLine, setOnLine] = useState<boolean | null>(null);
  const [token, setToken] = useState<string>("checking…");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    function refresh() {
      setOnLine(typeof navigator !== "undefined" ? navigator.onLine : null);
      void loadNativeAuthToken().then((t) => setToken(t ? `${t.slice(0, 12)}…` : "null"));
    }

    refresh();
    const onOnline = () => refresh();
    const onOffline = () => refresh();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const interval = setInterval(() => setTick((n) => n + 1), 2000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(interval);
    };
  }, []);

  // Re-check the token every tick too, in case it changes without an
  // online/offline event (e.g. right after a fresh login).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    setOnLine(typeof navigator !== "undefined" ? navigator.onLine : null);
    void loadNativeAuthToken().then((t) => setToken(t ? `${t.slice(0, 12)}…` : "null"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  if (!Capacitor.isNativePlatform()) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: onLine ? "rgba(20,120,20,0.95)" : "rgba(160,20,20,0.95)",
        color: "white",
        fontSize: 11,
        fontFamily: "monospace",
        padding: "6px 8px",
        paddingTop: "env(safe-area-inset-top, 6px)",
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        pointerEvents: "none",
      }}
    >
      <span>onLine: {String(onLine)}</span>
      <span>token: {token}</span>
      <span>route: {pathname}</span>
    </div>
  );
}
