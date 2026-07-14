import { Capacitor } from "@capacitor/core";

export const APP_NAME = "FitTrack Pro";

/**
 * Same production host the native Swift side already hardcodes
 * (WatchAPIProxy.swift, CardioPictureInPicturePlugin.swift) — the statically-
 * exported native build (project-docs/offline-first-roadmap.md Phase 2) has
 * no local server behind it, so relative `/api/...` fetches from within it
 * need to resolve here instead. See src/components/native-auth-fetch-patch.tsx.
 */
export const PRODUCTION_API_ORIGIN =
  process.env.NEXT_PUBLIC_API_ORIGIN ?? "https://fittrack-pro-ashen.vercel.app";

export const MUSCLE_GROUPS = [
  "CHEST",
  "BACK",
  "SHOULDERS",
  "BICEPS",
  "TRICEPS",
  "LEGS",
  "GLUTES",
  "CORE",
  "FOREARMS",
  "CALVES",
  "FULL_BODY",
  "CARDIO",
  "OTHER",
] as const;

export const EQUIPMENT_TYPES = [
  "BARBELL",
  "DUMBBELL",
  "MACHINE",
  "CABLE",
  "BODYWEIGHT",
  "KETTLEBELL",
  "BAND",
  "OTHER",
] as const;

export const DEFAULT_REST_TIMER = 180;

export const ROUTES = {
  home: "/",
  login: "/login",
  register: "/register",
  dashboard: "/dashboard",
  workouts: "/workouts",
  newWorkout: "/workouts/new",
  cardioWorkout: "/workouts/cardio",
  plans: "/plans",
  exercises: "/exercises",
  exercisesUsage: "/exercises/usage",
  bodyWeight: "/body-weight",
  settings: "/settings",
  coach: "/coach",
  plateCalculator: "/plate-calculator",
  records: "/records",
  health: "/health",
  more: "/more",
} as const;

/**
 * Same problem as `workoutHref`/`planHref` (src/lib/workout-href.ts) — the
 * static export only pre-renders `/exercises/_`, so a real id has no
 * matching file on native and falls back to a full reload that lands a
 * logged-in user back on the dashboard. Routing through the placeholder
 * with the id as a query param avoids that; exercises/[id]/page-client.tsx
 * reads it from there. The web build keeps the clean path-based URL.
 */
export function exercisePath(id: string) {
  if (Capacitor.isNativePlatform()) {
    return `/exercises/_?id=${id}`;
  }
  return `/exercises/${id}`;
}

/** next/cache tag for `unstable_cache` dashboard payload — invalidate after workout/body changes */
export function dashboardCacheTag(userId: string) {
  return `dashboard-user-${userId}`;
}

/** next/cache tag for workouts list page + default GET /api/workouts */
export function workoutsListCacheTag(userId: string) {
  return `workouts-list-${userId}`;
}
