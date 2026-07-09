export const APP_NAME = "FitTrack Pro";

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

export const DEFAULT_REST_TIMER = 90;

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

export function exercisePath(id: string) {
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
