"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

interface CardioPictureInPicturePlugin {
  isSupported(): Promise<{ supported: boolean }>;
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(eventName: "stopped", listenerFunc: () => void): Promise<{ remove: () => void }>;
}

const CardioPictureInPicture = registerPlugin<CardioPictureInPicturePlugin>("CardioPictureInPicture");

/**
 * Native system Picture in Picture for the live cardio view — a real AVKit
 * PiP window (draggable/dockable, floats over any other app), not a
 * web/JS overlay. The window's content (zone + bpm) is rendered and kept
 * live entirely on the native side once started; see
 * CardioPictureInPicturePlugin.swift and CardioLiveRelay.swift for why that
 * has to bypass this JS bridge for the actual per-second updates (the
 * WKWebView is suspended shortly after this app backgrounds, which is
 * exactly when PiP is supposed to still be running).
 */

export async function isCardioPipSupported(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { supported } = await CardioPictureInPicture.isSupported();
    return supported;
  } catch {
    return false;
  }
}

export async function startCardioPip(): Promise<void> {
  await CardioPictureInPicture.start();
}

export async function stopCardioPip(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await CardioPictureInPicture.stop();
  } catch {
    // Non-fatal — e.g. already stopped.
  }
}

/** Fires when PiP closes for any reason (user closed it, system reclaimed
 *  it, or our own `stopCardioPip()`) — lets the caller un-toggle its button. */
export function onCardioPipStopped(handler: () => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let removed = false;
  let handle: { remove: () => void } | undefined;
  void CardioPictureInPicture.addListener("stopped", handler).then((h) => {
    if (removed) {
      h.remove();
    } else {
      handle = h;
    }
  });
  return () => {
    removed = true;
    handle?.remove();
  };
}
