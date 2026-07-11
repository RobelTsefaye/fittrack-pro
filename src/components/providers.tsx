"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";
import { OfflineSyncProvider } from "@/components/offline-sync-provider";
import { NativePushRegister } from "@/components/native-push-register";
import { NativeHealthSync } from "@/components/native-health-sync";
import { NativeAppLock } from "@/components/native-app-lock";
import { NativeWatchWorkoutSync } from "@/components/native-watch-workout-sync";
import { NativeAuthFetchPatch } from "@/components/native-auth-fetch-patch";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchWhenOffline={false}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
        <NativeAuthFetchPatch />
        <PwaRegister />
        {/*
          These fire real native I/O (HealthKit sync, WatchConnectivity,
          offline-queue flush) immediately on mount, and NativePushRegister
          can trigger the system "Allow Notifications?" permission alert. Any
          of that racing the Face ID prompt below risks the OS canceling
          the concurrent LocalAuthentication session (observed on-device as
          BiometricLock.authenticate() rejecting with "Authentication
          canceled", most reliably offline where the flurry of failed
          network calls widens the race window). Nesting them inside
          NativeAppLock defers them until after a successful unlock.
        */}
        <NativeAppLock>
          <NativePushRegister />
          <NativeHealthSync />
          <NativeWatchWorkoutSync />
          <OfflineSyncProvider />
          {children}
        </NativeAppLock>
        <Toaster />
      </ThemeProvider>
    </SessionProvider>
  );
}
