"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";

/**
 * Replaces WKWebView's `navigator.onLine` with the native network status.
 *
 * WKWebView's own onLine flag is unreliable: after airplane-mode toggles it
 * can stay stuck at `false` even with WiFi fully connected. Since Phase 3
 * every screen checks `navigator.onLine` FIRST and skips the network
 * entirely when false, a stuck false bricks the whole app into permanent
 * offline mode (observed on-device: healthy server + valid token, but every
 * screen showing its offline/empty state).
 *
 * Overriding the getter here fixes every one of those ~20 call sites at
 * once, and dispatching real "online"/"offline" events keeps the existing
 * listeners (OfflineSyncProvider's flush, PwaRegister's cache warming)
 * working unchanged. No-ops on web, where the browser's onLine is fine.
 *
 * Starts optimistic (`true`): a wrong "online" degrades gracefully — the
 * fetch fails and the existing catch-paths fall back to cache — while a
 * wrong "offline" skips the network with no recovery, which is exactly the
 * failure mode this exists to kill.
 */
export function NativeOnlineStatusPatch() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let connected = true;

    try {
      Object.defineProperty(window.navigator, "onLine", {
        get: () => connected,
        configurable: true,
      });
    } catch {
      // Property not configurable in this WebView — leave the native
      // default in place rather than half-patching.
      return;
    }

    const apply = (isConnected: boolean) => {
      const changed = connected !== isConnected;
      connected = isConnected;
      if (changed) {
        window.dispatchEvent(new Event(isConnected ? "online" : "offline"));
      }
    };

    void Network.getStatus().then((s) => apply(s.connected));

    let removeListener: (() => void) | undefined;
    const listenerPromise = Network.addListener("networkStatusChange", (s) => apply(s.connected));
    void listenerPromise.then((handle) => {
      removeListener = () => void handle.remove();
    });

    return () => {
      removeListener?.();
    };
  }, []);

  return null;
}
