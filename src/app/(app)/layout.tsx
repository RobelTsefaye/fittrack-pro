import { AppShell } from "@/components/layout/app-shell";
import { RequireAuth } from "@/components/auth/require-auth";

// Deliberately static — no server-side auth()/data-fetching. A statically-
// exported build (project-docs/offline-first-roadmap.md Phase 2) pre-renders
// this once at build time, not per-request, so anything dynamic has to live
// in a client component instead. RequireAuth is the client-side replacement
// for the auth() + redirect() this used to do server-side; ActiveWorkoutBanner
// (inside AppShell) already has its own client-side fetch fallback for the
// initialActiveWorkout this layout used to prefetch server-side — that fetch
// now runs on every mount instead of being pre-seeded, trading a brief pop-in
// for not needing a server at all.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
