export type QueuedWorkoutOp =
  | { t: "post_workout"; name?: string | null }
  | { t: "patch_workout"; name?: string | null }
  | { t: "post_exercise"; exerciseId: string; clientWeId: string }
  | { t: "post_set"; clientWeId: string; clientSetId: string; isWarmup?: boolean }
  | { t: "patch_set"; clientSetId: string; body: Record<string, unknown> }
  | { t: "delete_set"; clientSetId: string }
  | { t: "delete_we"; clientWeId: string }
  | { t: "set_superset_group"; clientWeId: string; group: number | null }
  | { t: "complete_workout" };
