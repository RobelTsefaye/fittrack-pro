"use client";

import { usePathname } from "next/navigation";
import { ActiveWorkoutBanner, type ActiveWorkoutItem } from "@/components/layout/active-workout-banner";
import { CardioActiveBanner } from "@/components/layout/cardio-active-banner";
import { RestTimerProvider } from "@/features/workouts/rest-timer-context";
import { CardioLiveProvider } from "@/features/cardio/cardio-live-context";
import { MobileTopBar } from "@/components/layout/navbar";
import { BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({
  children,
  initialActiveWorkout = null,
}: {
  children: React.ReactNode;
  initialActiveWorkout?: ActiveWorkoutItem | null;
}) {
  // Keyed by the path, so every page change rises in once.
  const pathname = usePathname();
  return (
    <div className="relative flex h-dvh max-h-dvh min-h-dvh overflow-hidden bg-background">
      {/* Ambient aurora + grid backdrop (dark mode, purely decorative) */}
      <div aria-hidden className="app-aurora" />

      {/* ── Desktop sidebar (≥ lg); phones/tablets use the bottom tab bar ── */}
      <div className="relative z-20 hidden lg:flex">
        <Sidebar />
      </div>

      {/* ── Main column ──────────────────────────────────── */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        <CardioLiveProvider>
        <RestTimerProvider>

          {/* Mobile top bar */}
          <MobileTopBar />

          {/* Active workout strip */}
          <ActiveWorkoutBanner initialActive={initialActiveWorkout} />
          <CardioActiveBanner />

          {/* Scrollable content */}
          <main
            id="main-content"
            className="main-scroll flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 pt-2 pb-5 sm:px-6 md:px-8 md:pt-4 md:pb-7 lg:px-10 lg:pt-8 tab-bar-safe"
          >
            <div key={pathname} className="page-in mx-auto w-full max-w-5xl xl:max-w-6xl">
              {children}
            </div>
          </main>

          {/* Bottom tab bar */}
          <BottomTabBar />

        </RestTimerProvider>
        </CardioLiveProvider>
      </div>
    </div>
  );
}
