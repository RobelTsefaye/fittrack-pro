"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { OfflineSyncProvider } from "@/components/offline-sync-provider";
import { PwaRegister } from "@/components/pwa-register";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <PwaRegister />
        <OfflineSyncProvider />
        {children}
        <Toaster />
      </ThemeProvider>
    </SessionProvider>
  );
}
