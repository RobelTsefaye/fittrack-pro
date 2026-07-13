"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";
import { OfflineSyncProvider } from "@/components/offline-sync-provider";
import { NativePushRegister } from "@/components/native-push-register";
import { NativeHealthSync } from "@/components/native-health-sync";
import { NativeWatchWorkoutSync } from "@/components/native-watch-workout-sync";
import { NativeAuthFetchPatch } from "@/components/native-auth-fetch-patch";
import { NativeOnlineStatusPatch } from "@/components/native-online-status-patch";
import { PreviousLogsCacheWarmer } from "@/components/previous-logs-cache-warmer";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchWhenOffline={false}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
        <NativeAuthFetchPatch />
        <NativeOnlineStatusPatch />
        <PwaRegister />
        <NativePushRegister />
        <NativeHealthSync />
        <NativeWatchWorkoutSync />
        <OfflineSyncProvider />
        <PreviousLogsCacheWarmer />
        {children}
        <Toaster />
      </ThemeProvider>
    </SessionProvider>
  );
}
