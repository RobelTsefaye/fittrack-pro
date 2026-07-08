"use client";

import { ActiveWorkoutBanner, type ActiveWorkoutItem } from "@/components/layout/active-workout-banner";
import { RestTimerProvider } from "@/features/workouts/rest-timer-context";
import { MobileTopBar } from "@/components/layout/navbar";
import { BottomTabBar } from "@/components/layout/bottom-tab-bar";

export function AppShell({
  children,
  initialActiveWorkout = null,
}: {
  children: React.ReactNode;
  initialActiveWorkout?: ActiveWorkoutItem | null;
}) {
  return (
    <div className="flex h-dvh max-h-dvh min-h-dvh overflow-hidden bg-background">

      {/* ── Main column ──────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <RestTimerProvider>

          {/* Mobile top bar */}
          <MobileTopBar />

          {/* Active workout strip */}
          <ActiveWorkoutBanner initialActive={initialActiveWorkout} />

          {/* Scrollable content */}
          <main
            id="main-content"
            className="main-scroll flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain bg-background px-4 pt-2 pb-5 sm:px-6 md:px-8 md:pt-4 md:pb-7 tab-bar-safe"
          >
            <div className="mx-auto w-full max-w-5xl">
              {children}
            </div>
          </main>

          {/* Bottom tab bar */}
          <BottomTabBar />

        </RestTimerProvider>
      </div>
    </div>
  );
}
