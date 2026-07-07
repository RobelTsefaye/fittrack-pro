"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";
import { OfflineSyncProvider } from "@/components/offline-sync-provider";
import { NativePushRegister } from "@/components/native-push-register";
import { NativeHealthSync } from "@/components/native-health-sync";
import { NativeAppLock } from "@/components/native-app-lock";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchWhenOffline={false}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
        <PwaRegister />
        <NativePushRegister />
        <NativeHealthSync />
        <OfflineSyncProvider />
        <NativeAppLock>{children}</NativeAppLock>
        <Toaster />
      </ThemeProvider>
    </SessionProvider>
  );
}
