"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { ActiveWorkoutBanner } from "@/components/layout/active-workout-banner";
import { RestTimerProvider } from "@/features/workouts/rest-timer-context";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileTopBar } from "@/components/layout/navbar";
import { BottomTabBar } from "@/components/layout/bottom-tab-bar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex h-dvh max-h-dvh min-h-dvh overflow-hidden bg-background">

      {/* ── Desktop sidebar — always visible on lg+ ─────── */}
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />

      {/* ── Mobile backdrop ──────────────────────────────── */}
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-pointer touch-manipulation bg-black/40 backdrop-blur-sm lg:hidden"
          aria-label="Menü schließen"
          onClick={closeSidebar}
          onTouchEnd={(e) => { e.preventDefault(); closeSidebar(); }}
          onKeyDown={(e) => { if (e.key === "Escape") closeSidebar(); }}
        />
      )}

      {/* ── Main column ──────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <RestTimerProvider>

          {/* Mobile top bar — hidden on desktop (sidebar replaces it) */}
          <MobileTopBar onMenuClick={() => setSidebarOpen(true)} />

          {/* Active workout strip */}
          <ActiveWorkoutBanner />

          {/* Scrollable content */}
          <main
            id="main-content"
            className="main-scroll flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain bg-background px-4 py-5 sm:px-6 md:px-8 md:py-7 safe-bottom-pad tab-bar-safe"
          >
            <div className="mx-auto w-full max-w-5xl">
              {children}
            </div>
          </main>

          {/* Bottom tab bar — mobile only */}
          <BottomTabBar />

        </RestTimerProvider>
      </div>
    </div>
  );
}
