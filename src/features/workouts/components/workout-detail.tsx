"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/app-link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Clock, GripVertical, Plus, Timer, Trash2, X } from "lucide-react";
import { WorkoutShareButton } from "./workout-share-button";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ROUTES, exercisePath, DEFAULT_REST_TIMER } from "@/lib/constants";
import type { PreviousLogEntry, PreviousSetEntry } from "@/features/workouts/previous-logs-types";
import { loadPreviousLogsCache, savePreviousLogsCache } from "@/lib/offline/screen-caches";
import { ExercisePickerDialog, type ExercisePickerExercise } from "./exercise-picker-dialog";
import { SetRow } from "./set-row";
import { useRestTimerActions } from "../rest-timer-context";
import { useWorkoutTimer } from "../hooks/use-workout-timer";
import { sortSetsForDisplay } from "../set-sort";
import { useI18n } from "@/lib/i18n-provider";
import type { WorkoutData, WorkoutExerciseData, WorkoutSetData } from "@/features/workouts/workout-types";
import {
  enqueueWorkoutOp,
  listQueueForWorkout,
  loadWorkoutSnapshot,
  patchWorkoutListCacheEntry,
  purgeWorkoutLocal,
  saveWorkoutSnapshot,
} from "@/lib/offline/workout-offline-store";
import { notifyActiveWorkoutChanged } from "@/components/layout/active-workout-banner";
import { hapticWorkoutCompleted, hapticPersonalRecord } from "@/lib/native/haptics";
import {
  syncActiveWorkoutToWatch,
  clearWatchWorkoutState,
  computeRestTimerEndsAt,
} from "@/lib/native/watch-connectivity";

function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }
  return `${m}m ${s}s`;
}

function renumberSets(sets: WorkoutSetData[]): WorkoutSetData[] {
  return sets.map((s, i) => ({ ...s, setNumber: i + 1 }));
}

function mapApiSet(raw: Record<string, unknown>): WorkoutSetData {
  return {
    id: String(raw.id),
    setNumber: Number(raw.setNumber),
    reps: raw.reps == null ? null : Number(raw.reps),
    weight: raw.weight == null ? null : Number(raw.weight),
    rpe: raw.rpe == null ? null : Number(raw.rpe),
    isWarmup: !!raw.isWarmup,
    isCompleted: !!raw.isCompleted,
    completedAt: raw.completedAt == null ? null : String(raw.completedAt),
  };
}

function formatWeightForHint(n: number): string {
  const v = Math.round(Number(n) * 100) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
}

function formatSetHint(
  entry: PreviousSetEntry,
  weightUnit: string,
  t: (key: string, params?: Record<string, string | number | undefined>) => string
): string | null {
  if (entry.weight == null && entry.reps == null) return null;
  const w =
    entry.weight != null ? `${formatWeightForHint(Number(entry.weight))} ${weightUnit}` : "";
  const r = entry.reps != null ? String(entry.reps) : "";
  const values = w && r ? `${w} × ${r}` : w || r;
  return t("workouts.previousTrainingHint", { values });
}

/** Find the matching previous set for a given working-set index (0-based among non-warmups). */
function getPreviousHintForSet(
  prevSets: PreviousLogEntry | undefined,
  workingSetIndex: number,
): PreviousSetEntry | undefined {
  if (!prevSets || prevSets.length === 0) return undefined;
  return prevSets[workingSetIndex];
}

function patchSetInWorkout(
  w: WorkoutData,
  setId: string,
  body: Record<string, unknown>,
  complete: boolean
): WorkoutData {
  return {
    ...w,
    workoutExercises: w.workoutExercises.map((we) => ({
      ...we,
      sets: we.sets.map((set) => {
        if (set.id !== setId) return set;
        const next = { ...set };
        if (body.reps !== undefined) next.reps = typeof body.reps === "number" ? body.reps : null;
        if (body.weight !== undefined) next.weight = typeof body.weight === "number" ? body.weight : null;
        if (body.isCompleted === true || complete) {
          next.isCompleted = true;
          // Offline optimistic path — without this, computeRestTimerEndsAt
          // (watch-connectivity.ts) has no fresh anchor for this completion
          // until the offline queue syncs and a real completedAt comes back
          // from the server, so the Watch's rest timer wouldn't reset yet.
          next.completedAt = new Date().toISOString();
        }
        return next;
      }),
    })),
  };
}

interface SortableExerciseCardProps {
  we: WorkoutExerciseData;
  isActive: boolean;
  workoutId: string;
  weightLabel: string;
  useLocalWrites: boolean;
  previousSets?: PreviousLogEntry;
  onRemove: (weId: string) => void;
  onAddSet: (weId: string, isWarmup?: boolean) => void;
  onMergeSet: (weId: string, data: WorkoutSetData) => void;
  onRemoveSet: (weId: string, setId: string) => void;
  onSetCompleted: () => void;
  patchSetOffline: (setId: string, body: Record<string, unknown>, complete: boolean) => Promise<void>;
  deleteSetOffline: (setId: string) => Promise<void>;
  t: (key: string, params?: Record<string, string | number | undefined>) => string;
  /** Edit weight/reps on an already-finished workout */
  reviseCompletedSets?: boolean;
}

const SortableExerciseCard = memo(function SortableExerciseCard({
  we,
  isActive,
  workoutId,
  weightLabel,
  useLocalWrites,
  previousSets,
  onRemove,
  onAddSet,
  onMergeSet,
  onRemoveSet,
  onSetCompleted,
  patchSetOffline,
  deleteSetOffline,
  t,
  reviseCompletedSets = false,
}: SortableExerciseCardProps) {
  const rowDisabled = !isActive && !reviseCompletedSets;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: we.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
          <div className="flex min-w-0 flex-1 items-start gap-1 pr-1">
            {isActive && (
              <button
                type="button"
                className="mt-0.5 cursor-grab touch-none shrink-0 text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
                aria-label={t("workouts.dragToReorderAria")}
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <CardTitle className="text-base leading-snug break-words">
                <Link
                  href={exercisePath(we.exercise.id)}
                  className="hover:underline underline-offset-2"
                >
                  {we.exercise.name}
                </Link>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {we.exercise.muscleGroup.replace(/_/g, " ")}
              </p>
            </div>
          </div>
          {isActive && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => onRemove(we.id)}
              aria-label={t("workouts.removeExerciseAria")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="hidden items-center gap-2 sm:flex">
            <span className="w-6 shrink-0 text-center text-[10px] font-medium uppercase text-muted-foreground">#</span>
            <span className="w-16 text-center text-[10px] font-medium uppercase text-muted-foreground">{weightLabel}</span>
            <span className="w-16 text-center text-[10px] font-medium uppercase text-muted-foreground">{t("workouts.reps")}</span>
          </div>
          {sortSetsForDisplay(we.sets).map((set, _idx, sorted) => {
            let workingIdx = 0;
            if (!set.isWarmup) {
              for (const s of sorted) {
                if (s.id === set.id) break;
                if (!s.isWarmup) workingIdx++;
              }
            }
            const prevEntry = !set.isWarmup
              ? getPreviousHintForSet(previousSets, workingIdx)
              : undefined;
            return (
            <SetRow
              key={set.id}
              set={set}
              workoutId={workoutId}
              weightUnitLabel={weightLabel}
              unlockCompleted={reviseCompletedSets}
              previousHint={
                prevEntry && set.weight == null && set.reps == null && !set.isCompleted
                  ? formatSetHint(prevEntry, weightLabel, t)
                  : null
              }
              onMergeSet={
                useLocalWrites || (!isActive && !reviseCompletedSets)
                  ? undefined
                  : (data) => onMergeSet(we.id, data)
              }
              onRemoveSet={
                useLocalWrites || (!isActive && !reviseCompletedSets)
                  ? undefined
                  : () => onRemoveSet(we.id, set.id)
              }
              onComplete={onSetCompleted}
              disabled={rowDisabled}
              offlineHandlers={
                useLocalWrites && isActive
                  ? {
                      patchSet: (body, complete) => patchSetOffline(set.id, body, complete),
                      deleteSet: () => deleteSetOffline(set.id),
                    }
                  : undefined
              }
            />
            );
          })}
          {isActive && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" variant="outline" size="xs" onClick={() => onAddSet(we.id)}>
                <Plus className="mr-1 h-3 w-3" />
                {t("workouts.set")}
              </Button>
              <Button type="button" variant="outline" size="xs" onClick={() => onAddSet(we.id, true)}>
                {t("workouts.warmup")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}, (prev, next) =>
  prev.we === next.we &&
  prev.isActive === next.isActive &&
  prev.workoutId === next.workoutId &&
  prev.weightLabel === next.weightLabel &&
  prev.useLocalWrites === next.useLocalWrites &&
  prev.previousSets === next.previousSets &&
  prev.reviseCompletedSets === next.reviseCompletedSets
);

interface WorkoutDetailProps {
  workoutId: string;
  defaultRestSeconds: number;
  weightUnit: "KG" | "LB";
  /** Server-prefetched workout — renders instantly; the client refresh
   *  (offline queue check + revalidation) still runs silently on mount. */
  initialWorkout?: WorkoutData | null;
}

export function WorkoutDetail({
  workoutId,
  defaultRestSeconds,
  weightUnit,
  initialWorkout = null,
}: WorkoutDetailProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [workout, setWorkout] = useState<WorkoutData | null>(initialWorkout);
  const [loading, setLoading] = useState(initialWorkout == null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addingExercise, setAddingExercise] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deletingWorkout, setDeletingWorkout] = useState(false);
  const [netOnline, setNetOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [offlineOriginSession, setOfflineOriginSession] = useState(false);
  const [pendingQueue, setPendingQueue] = useState(false);
  // In-app replacement for window.confirm(): native WKWebView JS-dialog
  // panels can silently fail to appear (observed on-device stuck behind an
  // await that never resolves — no dialog, no error, no way to proceed) when
  // another system alert/permission-sheet has recently been shown, which is
  // common in this app given HealthKit sync retries and the Face ID gate.
  // This sidesteps the native dialog bridge entirely.
  const [confirmState, setConfirmState] = useState<{
    message: string;
    resolve: (value: boolean) => void;
  } | null>(null);
  const askConfirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ message, resolve });
    });
  }, []);
  const [previousLogs, setPreviousLogs] = useState<Record<string, PreviousLogEntry>>({});
  const [reviseCompletedSets, setReviseCompletedSets] = useState(false);
  const [completionSummary, setCompletionSummary] = useState<{
    hasPrevious: boolean;
    previousVolume: number;
    currentVolume: number;
    volumeDelta: number;
    volumeDeltaPct: number | null;
  } | null>(null);

  const restTimer = useRestTimerActions();

  const fireRestDone = useCallback(() => {
    toast.success(t("workouts.restDoneToast"), { duration: 8000 });
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(t("workouts.restNotificationTitle"), {
        body: t("workouts.restNotificationBody"),
      });
    }
  }, [t]);
  const startedAt = workout ? new Date(workout.startedAt) : null;
  const { formatted: elapsedLabel } = useWorkoutTimer(startedAt);

  const isActive = workout && !workout.completedAt;
  const weightLabel = weightUnit === "LB" ? "lb" : "kg";
  const useLocalWrites = !netOnline || offlineOriginSession || pendingQueue;

  // Ordered exercise list — kept in sync with workout state
  const [exerciseIds, setExerciseIds] = useState<string[]>([]);
  const reorderPending = useRef(false);

  const mergeSet = useCallback((weId: string, data: WorkoutSetData) => {
    setWorkout((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        workoutExercises: prev.workoutExercises.map((we) =>
          we.id !== weId
            ? we
            : {
                ...we,
                sets: sortSetsForDisplay(
                  we.sets.map((s) => (s.id === data.id ? { ...s, ...data } : s))
                ),
              }
        ),
      };
    });
  }, []);

  const removeSetFromWe = useCallback((weId: string, setId: string) => {
    setWorkout((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        workoutExercises: prev.workoutExercises.map((we) =>
          we.id !== weId
            ? we
            : { ...we, sets: renumberSets(we.sets.filter((s) => s.id !== setId)) }
        ),
      };
    });
  }, []);

  const replaceSetsForWe = useCallback((weId: string, sets: WorkoutSetData[]) => {
    setWorkout((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        workoutExercises: prev.workoutExercises.map((we) =>
          we.id !== weId ? we : { ...we, sets: sortSetsForDisplay(sets) }
        ),
      };
    });
  }, []);

  useEffect(() => {
    if (workout) {
      setExerciseIds(
        [...workout.workoutExercises]
          .sort((a, b) => a.order - b.order)
          .map((we) => we.id)
      );
    }
  }, [workout]);

  /** Auto-start the rest timer (and its Live Activity / Dynamic Island
   *  mirror) right when a workout begins, not just after the first set —
   *  fires once per fresh workout (no sets completed yet). Guarded so
   *  re-opening a workout that's already in progress doesn't restart it. */
  const autoStartedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isActive || !workout) return;
    if (autoStartedRef.current === workout.id) return;
    const hasCompletedSet = workout.workoutExercises.some((we) =>
      we.sets.some((s) => s.isCompleted)
    );
    if (hasCompletedSet) return;
    autoStartedRef.current = workout.id;
    // Anchor-derived, not startRestTimer()'s "fresh from now" — a workout
    // started on the Watch begins its rest countdown immediately from
    // workout.startedAt (see computeRestTimerEndsAt), so opening the phone
    // any time after that used to restart a full-length timer from the
    // moment the phone happened to open instead of continuing the one
    // already running.
    startRestTimerFromServerAnchor(workout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, workout, defaultRestSeconds]);

  /**
   * Safety net for the rest timer: stop it whenever the workout stops being
   * active, no matter what caused that. The explicit complete/cancel buttons
   * already call restTimer.stop() directly, but a finish or cancel
   * triggered *from the Watch* bypasses this component entirely (it PATCHes
   * the API directly) — this page only learns about it via the next poll
   * tick or a 404, and without this, the rest timer (and its Live Activity)
   * kept running as if the workout were still going.
   */
  const wasActiveRef = useRef(false);
  /** Monotonic counter guarding `loadWorkout` against out-of-order responses. */
  const loadRequestIdRef = useRef(0);
  useEffect(() => {
    if (wasActiveRef.current && !isActive) restTimer.stop();
    wasActiveRef.current = !!isActive;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !workout) return;

    const oldIndex = exerciseIds.indexOf(active.id as string);
    const newIndex = exerciseIds.indexOf(over.id as string);
    const newIds = arrayMove(exerciseIds, oldIndex, newIndex);

    setExerciseIds(newIds);

    // Reorder workout state locally
    setWorkout((prev) => {
      if (!prev) return prev;
      const byId = new Map(prev.workoutExercises.map((we) => [we.id, we]));
      return {
        ...prev,
        workoutExercises: newIds
          .map((id, i) => ({ ...byId.get(id)!, order: i + 1 }))
          .filter(Boolean),
      };
    });

    if (reorderPending.current) return;
    reorderPending.current = true;
    try {
      const res = await fetch(`/api/workouts/${workoutId}/exercises/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: newIds }),
      });
      if (!res.ok) {
        // Roll back optimistic update on failure
        setExerciseIds(exerciseIds);
        setWorkout((prev) => {
          if (!prev) return prev;
          const byId = new Map(prev.workoutExercises.map((we) => [we.id, we]));
          return {
            ...prev,
            workoutExercises: exerciseIds
              .map((id, i) => ({ ...byId.get(id)!, order: i + 1 }))
              .filter(Boolean),
          };
        });
      }
    } catch {
      // Roll back on network error
      setExerciseIds(exerciseIds);
    } finally {
      reorderPending.current = false;
    }
  }

  useEffect(() => {
    const on = () => setNetOnline(true);
    const off = () => setNetOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const loadWorkout = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    setError(null);

    // Monotonic request id: the 1s active-workout poll can have several
    // fetches in flight at once, and if a slow earlier response lands after a
    // newer one it would overwrite fresh state with stale data (including
    // clobbering an in-progress set edit). Only the most recent request is
    // allowed to apply its result — `isStale()` is checked right before every
    // state mutation below.
    const requestId = ++loadRequestIdRef.current;
    const isStale = () => requestId !== loadRequestIdRef.current;

    try {
      const queued = await listQueueForWorkout(workoutId);
      if (queued.length > 0) {
        const snap = await loadWorkoutSnapshot(workoutId);
        if (isStale()) return;
        if (!snap) {
          setWorkout(null);
          setError(t("workouts.offlineNoSnapshot"));
          return;
        }
        setWorkout(snap.data);
        setOfflineOriginSession(snap.offlineOrigin);
        setPendingQueue(true);
        return;
      }

      try {
        const res = await fetch(`/api/workouts/${workoutId}`, { credentials: "include" });
        if (isStale()) return;
        if (res.status === 404) {
          // A real 404 means we successfully reached the server and it
          // authoritatively says this workout is gone — e.g. cancelled from
          // the Watch while this page was open. That's different from "we
          // don't know" (network failure below, where the snapshot fallback
          // is still correct): don't resurrect a stale cached copy here, or
          // the phone keeps showing a workout that no longer exists anywhere.
          try {
            await purgeWorkoutLocal(workoutId);
          } catch {
            /* ignore IDB */
          }
          notifyActiveWorkoutChanged();
          setWorkout(null);
          setError(t("workouts.notFound"));
          return;
        }
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          const snap = await loadWorkoutSnapshot(workoutId);
          if (isStale()) return;
          if (snap) {
            setWorkout(snap.data);
            setOfflineOriginSession(snap.offlineOrigin);
            const q2 = await listQueueForWorkout(workoutId);
            if (isStale()) return;
            setPendingQueue(q2.length > 0);
            setError(null);
            return;
          }
          setError(typeof json.error === "string" ? json.error : t("workouts.loadFailed"));
          setWorkout(null);
          return;
        }
        const json = (await res.json()) as { data: WorkoutData };
        if (isStale()) return;
        setWorkout(json.data);
        await saveWorkoutSnapshot(workoutId, json.data, false);
        setOfflineOriginSession(false);
        setPendingQueue(false);
      } catch {
        const snap = await loadWorkoutSnapshot(workoutId);
        if (isStale()) return;
        if (snap) {
          setWorkout(snap.data);
          setOfflineOriginSession(snap.offlineOrigin);
          const q2 = await listQueueForWorkout(workoutId);
          setPendingQueue(q2.length > 0);
          setError(null);
          return;
        }
        setError(t("workouts.loadFailed"));
        setWorkout(null);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [workoutId, t]);

  const hasInitialData = useRef(initialWorkout != null);
  useEffect(() => {
    // With server-prefetched data, refresh silently (still picks up the
    // offline queue/snapshot state); otherwise do a full visible load.
    void loadWorkout({ silent: hasInitialData.current });
  }, [loadWorkout]);

  useEffect(() => {
    const sync = () => {
      void listQueueForWorkout(workoutId).then((q) => {
        setPendingQueue(q.length > 0);
        if (q.length === 0) void loadWorkout();
      });
    };
    window.addEventListener("online", sync);
    window.addEventListener("fittrack-offline-synced", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("fittrack-offline-synced", sync);
    };
  }, [workoutId, loadWorkout]);

  // Cache-first: "last time you did this exercise" used to be skipped
  // entirely whenever writes were local-only (offline, or an unsynced
  // offline-started workout) — the confirm-and-log flow then showed no
  // weight/reps hint at all. Reads whatever's cached per exercise (see
  // previousLogsCache in screen-caches.ts) immediately, then refreshes from
  // the network when actually online, regardless of `useLocalWrites` — that
  // flag is about how the CURRENT workout's own writes are routed, not
  // whether fetching read-only history about OTHER, already-completed
  // workouts is safe to attempt.
  useEffect(() => {
    if (!workout || workout.completedAt) return;
    const exerciseIds = [...new Set(workout.workoutExercises.map((we) => we.exerciseId))];
    if (exerciseIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const cached = await loadPreviousLogsCache<PreviousLogEntry>(exerciseIds);
      if (!cancelled && Object.keys(cached).length > 0) {
        setPreviousLogs((prev) => ({ ...cached, ...prev }));
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      try {
        const res = await fetch(`/api/workouts/${workoutId}/previous-logs`, { credentials: "include" });
        const json = (await res.json()) as { data?: Record<string, PreviousLogEntry> };
        if (!cancelled && json.data) {
          setPreviousLogs(json.data);
          void savePreviousLogsCache(json.data);
        }
      } catch {
        // already showing cache (if any) — nothing more to do
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workoutId, workout?.id, workout?.completedAt, workout?.workoutExercises?.length]);

  useEffect(() => {
    if (workout?.name != null) setNameDraft(workout.name);
    else if (workout) setNameDraft("");
  }, [workout?.name, workout?.id]);

  useEffect(() => {
    setReviseCompletedSets(false);
  }, [workout?.id]);

  async function persistLocal(next: WorkoutData, op: Parameters<typeof enqueueWorkoutOp>[1]) {
    await saveWorkoutSnapshot(workoutId, next, offlineOriginSession);
    await enqueueWorkoutOp(workoutId, op);
    setPendingQueue(true);
  }

  async function patchSetOffline(setId: string, body: Record<string, unknown>, complete: boolean) {
    if (!workout) return;
    const merged: Record<string, unknown> = { ...body };
    if (complete) merged.isCompleted = true;
    let next: WorkoutData | null = null;
    setWorkout((prev) => {
      if (!prev) return prev;
      next = patchSetInWorkout(prev, setId, merged, complete);
      return next;
    });
    if (next) {
      await persistLocal(next, { t: "patch_set", clientSetId: setId, body: merged });
    }
  }

  async function deleteSetOffline(setId: string) {
    if (!workout) return;
    const next: WorkoutData = {
      ...workout,
      workoutExercises: workout.workoutExercises.map((we) => ({
        ...we,
        sets: renumberSets(we.sets.filter((s) => s.id !== setId)),
      })),
    };
    setWorkout(next);
    await persistLocal(next, { t: "delete_set", clientSetId: setId });
  }

  async function saveName() {
    if (!workout || workout.completedAt) return;
    const trimmed = nameDraft.trim();
    const nextName = trimmed.length ? trimmed : null;
    if (nextName === workout.name || (nextName === null && workout.name === null)) return;
    setSavingName(true);
    if (useLocalWrites) {
      const next = { ...workout, name: nextName };
      setWorkout(next);
      await persistLocal(next, { t: "patch_workout", name: nextName });
      setSavingName(false);
      return;
    }
    await fetch(`/api/workouts/${workoutId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: nextName }),
    });
    setSavingName(false);
    await loadWorkout();
  }

  async function handleAddExercise(ex: ExercisePickerExercise) {
    if (!workout || workout.completedAt) return;
    if (useLocalWrites) {
      setAddingExercise(true);
      const weId = crypto.randomUUID();
      const setId = crypto.randomUUID();
      const order = workout.workoutExercises.length;
      const newWe: WorkoutExerciseData = {
        id: weId,
        exerciseId: ex.id,
        order,
        notes: null,
        isCompleted: false,
        exercise: {
          id: ex.id,
          name: ex.name,
          muscleGroup: ex.muscleGroup,
          equipment: ex.equipment,
        },
        sets: [
          {
            id: setId,
            setNumber: 1,
            reps: null,
            weight: null,
            rpe: null,
            isWarmup: false,
            isCompleted: false,
            completedAt: null,
          },
        ],
      };
      const next: WorkoutData = {
        ...workout,
        workoutExercises: [...workout.workoutExercises, newWe],
      };
      setWorkout(next);
      await saveWorkoutSnapshot(workoutId, next, offlineOriginSession);
      await enqueueWorkoutOp(workoutId, { t: "post_exercise", exerciseId: ex.id, clientWeId: weId });
      await enqueueWorkoutOp(workoutId, {
        t: "post_set",
        clientWeId: weId,
        clientSetId: setId,
        isWarmup: false,
      });
      setPendingQueue(true);
      setAddingExercise(false);
      setPickerOpen(false);
      return;
    }

    setAddingExercise(true);
    const res = await fetch(`/api/workouts/${workoutId}/exercises`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ exerciseId: ex.id }),
    });
    if (!res.ok) {
      setAddingExercise(false);
      return;
    }
    const json = await res.json();
    const weId = json.data?.id as string | undefined;
    if (weId) {
      await fetch(`/api/workouts/${workoutId}/exercises/${weId}/sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
    }
    setAddingExercise(false);
    setPickerOpen(false);
    await loadWorkout();
  }

  async function addSet(weId: string, isWarmup?: boolean) {
    if (!workout) return;
    if (useLocalWrites) {
      const we = workout.workoutExercises.find((w) => w.id === weId);
      if (!we) return;
      const setId = crypto.randomUUID();
      let nextSets: WorkoutSetData[];
      if (isWarmup) {
        const shifted = we.sets.map((s) => ({ ...s, setNumber: s.setNumber + 1 }));
        const newSet: WorkoutSetData = {
          id: setId,
          setNumber: 1,
          reps: null,
          weight: null,
          rpe: null,
          isWarmup: true,
          isCompleted: false,
          completedAt: null,
        };
        nextSets = sortSetsForDisplay([newSet, ...shifted]).map((s, i) => ({
          ...s,
          setNumber: i + 1,
        }));
      } else {
        const newSet: WorkoutSetData = {
          id: setId,
          setNumber: we.sets.length + 1,
          reps: null,
          weight: null,
          rpe: null,
          isWarmup: false,
          isCompleted: false,
          completedAt: null,
        };
        nextSets = sortSetsForDisplay([...we.sets, newSet]);
      }
      const next: WorkoutData = {
        ...workout,
        workoutExercises: workout.workoutExercises.map((w) =>
          w.id === weId ? { ...w, sets: nextSets } : w
        ),
      };
      setWorkout(next);
      await persistLocal(next, {
        t: "post_set",
        clientWeId: weId,
        clientSetId: setId,
        isWarmup: !!isWarmup,
      });
      return;
    }
    const res = await fetch(`/api/workouts/${workoutId}/exercises/${weId}/sets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(isWarmup ? { isWarmup: true } : {}),
    });
    if (!res.ok) return;
    const json = (await res.json()) as {
      data: { set: Record<string, unknown>; sets?: Record<string, unknown>[] };
    };
    const payload = json.data;
    const setPayload = mapApiSet(payload.set as Record<string, unknown>);
    if (payload.sets) {
      replaceSetsForWe(
        weId,
        payload.sets.map((s) => mapApiSet(s as Record<string, unknown>))
      );
    } else {
      setWorkout((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          workoutExercises: prev.workoutExercises.map((we) =>
            we.id !== weId
              ? we
              : { ...we, sets: sortSetsForDisplay([...we.sets, setPayload]) }
          ),
        };
      });
    }
  }

  async function removeExercise(weId: string) {
    if (!(await askConfirm(t("workouts.removeExerciseConfirm")))) return;
    if (useLocalWrites && workout) {
      const next: WorkoutData = {
        ...workout,
        workoutExercises: workout.workoutExercises.filter((we) => we.id !== weId),
      };
      setWorkout(next);
      await persistLocal(next, { t: "delete_we", clientWeId: weId });
      return;
    }
    await fetch(`/api/workouts/${workoutId}/exercises/${weId}`, {
      method: "DELETE",
      credentials: "include",
    });
    await loadWorkout();
  }

  async function completeWorkout() {
    if (!(await askConfirm(t("workouts.finishConfirm")))) return;
    if (useLocalWrites && workout) {
      setCompleting(true);
      const completedAt = new Date().toISOString();
      const durationSeconds = Math.max(
        0,
        Math.floor((Date.now() - new Date(workout.startedAt).getTime()) / 1000)
      );
      const next: WorkoutData = { ...workout, completedAt, durationSeconds };
      // Reflect the completion locally first — this must not get stuck
      // behind the IndexedDB writes below throwing (e.g. a Dexie hiccup):
      // the workout is still "done" from the user's perspective even if
      // queuing the sync op fails, so don't leave the button hung silently.
      setWorkout(next);
      restTimer.stop();
      void hapticWorkoutCompleted();
      try {
        // Patch the Workouts list's own cache — and only THEN notify — so
        // a listener that reacts to the notification (workout-history-
        // list.tsx refetching) reads already-correct data instead of racing
        // an unawaited write. That cache only reflects what the server
        // last returned, which predates this offline completion entirely.
        await patchWorkoutListCacheEntry(workoutId, { completedAt, durationSeconds });
        await saveWorkoutSnapshot(workoutId, next, offlineOriginSession);
        await enqueueWorkoutOp(workoutId, { t: "complete_workout" });
        setPendingQueue(true);
      } catch (err) {
        console.error("Failed to queue offline workout completion", err);
      } finally {
        notifyActiveWorkoutChanged();
        setCompleting(false);
      }
      router.refresh();
      return;
    }
    setCompleting(true);
    try {
      const res = await fetch(`/api/workouts/${workoutId}/complete`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        window.alert(t("workouts.finishFailed"));
        return;
      }
      const json = (await res.json()) as {
        data?: { completedAt: string; durationSeconds: number };
        comparison?: {
          hasPrevious: boolean;
          previousVolume: number;
          currentVolume: number;
          volumeDelta: number;
          volumeDeltaPct: number | null;
        };
        newPersonalRecords?: number;
      };
      if (json.comparison) setCompletionSummary(json.comparison);
      restTimer.stop();
      if (json.data) {
        // Same reasoning as the offline branch above — patch the Workouts
        // list's cache, and only THEN notify, so a listener that reacts to
        // the notification reads already-correct data instead of racing an
        // unawaited write.
        await patchWorkoutListCacheEntry(workoutId, {
          completedAt: json.data.completedAt,
          durationSeconds: json.data.durationSeconds,
        });
      }
      notifyActiveWorkoutChanged();
      void clearWatchWorkoutState(workoutId);
      if (json.newPersonalRecords && json.newPersonalRecords > 0) {
        void hapticPersonalRecord();
      } else {
        void hapticWorkoutCompleted();
      }
      await loadWorkout({ silent: true });
      router.refresh();
    } catch (err) {
      console.error("Failed to complete workout", err);
      window.alert(t("workouts.finishFailed"));
    } finally {
      setCompleting(false);
    }
  }

  /// Wall-clock ms of the last restTimer.start() call, regardless of which
  /// of the two trigger paths below caused it — guards against starting the
  /// timer twice for the *same* completion (this component's own
  /// onSetCompleted fires immediately; the poll-based detector below sees
  /// that same now-completed set a moment later and would otherwise treat
  /// it as a second, distinct completion). Only affects this page's own
  /// timer UI/notifications/Live Activity — the value the Watch sees is
  /// computed purely from workout data (see computeRestTimerEndsAt in
  /// watch-connectivity.ts), not tracked here at all anymore.
  const lastRestTimerStartAtRef = useRef(0);

  function startRestTimer() {
    const now = Date.now();
    if (now - lastRestTimerStartAtRef.current < 1500) return;
    lastRestTimerStartAtRef.current = now;
    restTimer.start(defaultRestSeconds, { onExpire: fireRestDone, workoutId: workout?.id });
  }

  /**
   * Same as startRestTimer(), but for a completion this component only
   * learned about after the fact (the poll-detector below, currently the
   * only caller) — starting fresh from "now" here would restart the full
   * countdown from whatever moment the phone happened to poll, even if the
   * set was actually completed (and its rest period already running, e.g.
   * on the Watch) well before that. Reported as "opening the app retriggers
   * the timer." Derives the same absolute endsAt computeRestTimerEndsAt
   * gives the Watch, then expresses it as "seconds from now" so it lands on
   * that same wall-clock moment regardless of when this fires.
   */
  function startRestTimerFromServerAnchor(w: WorkoutData) {
    const now = Date.now();
    if (now - lastRestTimerStartAtRef.current < 1500) return;
    lastRestTimerStartAtRef.current = now;
    const endsAtSeconds = computeRestTimerEndsAt(w);
    const totalDuration = (w.restTimerDefaultSeconds ?? DEFAULT_REST_TIMER) + (w.restTimerAdjustSeconds ?? 0);
    const secondsUntilEnd = Math.max(1, Math.round(endsAtSeconds - now / 1000));
    restTimer.start(secondsUntilEnd, {
      onExpire: fireRestDone,
      workoutId: w.id,
      totalDurationSeconds: totalDuration,
    });
  }

  function onSetCompleted() {
    if (isActive) startRestTimer();
    void pushWatchWorkoutState();
  }

  /**
   * Pushes the full workout (exercises + sets) to the paired Apple Watch
   * (see PhoneWorkoutObserver.swift on the Watch side), so its KraftLoggingView
   * mirror stays in sync with every set logged on the phone. Also fires once
   * on mount/workout-load below so opening the workout page — which happens
   * right after starting a workout — is enough to get the Watch synced,
   * without waiting for the first set to complete.
   */
  async function pushWatchWorkoutState() {
    if (!workout) return;
    await syncActiveWorkoutToWatch(workout, previousLogs);
  }

  useEffect(() => {
    if (!isActive) return;
    void pushWatchWorkoutState();
    // Deliberately depends on the whole `workout` object, not just its id —
    // loadWorkout below produces a fresh object on every poll tick, so this
    // re-pushes to the Watch whenever anything changed server-side,
    // including a set logged *on* the Watch (which lands via REST, gets
    // picked up by the next poll, and is pushed straight back — the Watch's
    // own optimistic update just gets confirmed with the same values).
    // `previousLogs` is also a dep so the Watch gets last-session hints as
    // soon as that separate fetch resolves, instead of waiting for the next
    // poll tick to happen to re-push.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout, isActive, previousLogs]);

  /**
   * Detects a set completed by something other than this component's own
   * onSetCompleted() — in practice, that's only the Watch: its logSet
   * request PATCHes the API directly, bypassing this page's React state
   * entirely, so the *only* way this component learns about it is the next
   * poll tick. When that happens, start the rest timer here too — the same
   * "completing a set starts the rest timer" behavior the phone gets
   * immediately, just arriving within one poll interval instead of instantly.
   */
  const knownCompletedSetIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!workout) return;
    const nowCompleted = new Set<string>();
    for (const we of workout.workoutExercises) {
      for (const s of we.sets) {
        if (s.isCompleted) nowCompleted.add(s.id);
      }
    }
    const known = knownCompletedSetIdsRef.current;
    // First run after mount just establishes the baseline — a workout
    // opened mid-session shouldn't retroactively fire the rest timer for
    // sets that were already done before this page ever loaded.
    if (known != null && isActive) {
      const hasNewCompletion = [...nowCompleted].some((id) => !known.has(id));
      if (hasNewCompletion) {
        startRestTimerFromServerAnchor(workout);
        void pushWatchWorkoutState();
      }
    }
    knownCompletedSetIdsRef.current = nowCompleted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout, isActive]);

  // Keeps both devices converged in near-real-time: a set logged on the
  // phone reaches the Watch via the effect above almost immediately, and a
  // set logged on the Watch reaches the phone via this poll within ~1s.
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      void loadWorkout({ silent: true });
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive, loadWorkout]);

  async function deleteCompletedWorkout() {
    if (!workout?.completedAt) return;
    if (!(await askConfirm(t("workouts.deleteCompletedConfirm")))) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      window.alert(t("workouts.deleteCompletedOffline"));
      return;
    }
    setDeletingWorkout(true);
    try {
      const res = await fetch(`/api/workouts/${workoutId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        window.alert(j.error ?? t("workouts.deleteCompletedFailed"));
        return;
      }
      try {
        await purgeWorkoutLocal(workoutId);
      } catch {
        /* ignore IDB */
      }
      router.push(ROUTES.workouts);
      router.refresh();
    } finally {
      setDeletingWorkout(false);
    }
  }

  async function cancelWorkout() {
    if (!workout || workout.completedAt) return;
    if (!(await askConfirm(t("workouts.cancelWorkoutConfirm")))) return;

    setCancelling(true);
    restTimer.stop();
    // Clear the paired Watch's mirrored workout too — otherwise cancelling
    // here strands the Watch in a KraftLoggingView for a workout that no
    // longer exists (the complete path already does this; cancel didn't).
    void clearWatchWorkoutState(workoutId);

    // Offline / local-writes path: just wipe IndexedDB and queue, then navigate
    if (useLocalWrites || offlineOriginSession) {
      try {
        await purgeWorkoutLocal(workoutId);
      } catch {
        /* ignore IDB errors */
      }
      notifyActiveWorkoutChanged();
      // Full-page nav so SW can serve the cached shell while offline
      window.location.href = ROUTES.workouts;
      return;
    }

    // Online path: delete via API
    try {
      const res = await fetch(`/api/workouts/${workoutId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        window.alert(j.error ?? t("workouts.cancelWorkoutFailed"));
        setCancelling(false);
        return;
      }
      try { await purgeWorkoutLocal(workoutId); } catch { /* ignore */ }
      notifyActiveWorkoutChanged();
      router.push(ROUTES.workouts);
      router.refresh();
    } catch {
      window.alert(t("workouts.cancelWorkoutFailed"));
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted/80" />
        <div className="h-40 animate-pulse rounded-xl bg-muted/80" />
      </div>
    );
  }

  if (error || !workout) {
    const isOfflineError = !netOnline || error === t("workouts.offlineNoSnapshot");
    return (
      <div className="space-y-4">
        <Link
          href={ROUTES.workouts}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex gap-1 px-0")}
        >
          <ArrowLeft className="h-4 w-4" />
          {t("workouts.backNavLong")}
        </Link>
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            {isOfflineError ? (
              <>
                <p className="text-2xl">📴</p>
                <p className="text-sm font-medium text-foreground">You&apos;re offline</p>
                <p className="text-xs text-muted-foreground">
                  This workout wasn&apos;t cached before you went offline. Start a new offline workout instead.
                </p>
                <Link
                  href={ROUTES.newWorkout}
                  className={cn(buttonVariants({ variant: "default", size: "sm" }), "inline-flex gap-1")}
                >
                  Start offline workout
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{error ?? t("workouts.notFound")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 max-[1024px]:pb-[max(5.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <Link
            href={ROUTES.workouts}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "inline-flex gap-1 -ml-2 px-2"
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            {t("workouts.backToWorkouts")}
          </Link>
          {workout.completedAt ? (
            <h1 className="text-2xl font-bold tracking-tight">
              {workout.name?.trim() || t("workouts.workoutFallback")}
            </h1>
          ) : (
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={saveName}
              disabled={savingName}
              placeholder={t("workouts.workoutNamePlaceholder")}
              className="max-w-md text-2xl font-bold h-auto py-1 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          )}
          <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{formatShortDate(workout.startedAt)}</span>
            {workout.planSessionId ? (
              <Badge variant="secondary" className="text-xs font-normal">
                {t("workouts.fromPlanBadge")}
              </Badge>
            ) : null}
            {workout.completedAt ? (
              <>
                <span className="inline-flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t("workouts.sessionComplete")}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(workout.durationSeconds)}
                </span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                <Timer className="h-3.5 w-3.5" />
                {elapsedLabel}
              </span>
            )}
          </p>
          {isActive ? (
            <div className="max-w-md space-y-1 text-xs text-muted-foreground">
              <p>{t("workouts.timerTrackingHint")}</p>
              <p>{t("workouts.restTimerBackgroundHint")}</p>
            </div>
          ) : null}
        </div>

        {isActive ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            {/* Fixing a checkmarked set used to require finishing the whole
                workout first (this toggle only appeared once workout.completedAt
                was set) — mid-workout it's just as reachable now. */}
            {!useLocalWrites ? (
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                type="button"
                onClick={() => setReviseCompletedSets((v) => !v)}
              >
                {reviseCompletedSets
                  ? t("workouts.doneEditingSets")
                  : t("workouts.editCompletedSets")}
              </Button>
            ) : null}
            <Button
              className="w-full shrink-0 sm:w-auto font-semibold"
              size="lg"
              onClick={completeWorkout}
              disabled={completing || cancelling}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {completing ? t("workouts.finishing") : t("workouts.finishWorkout")}
            </Button>
            <Button
              variant="outline"
              className="w-full shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
              onClick={() => void cancelWorkout()}
              disabled={completing || cancelling}
            >
              <X className="mr-2 h-4 w-4" />
              {cancelling ? t("workouts.cancellingWorkout") : t("workouts.cancelWorkout")}
            </Button>
          </div>
        ) : workout.completedAt ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            {/* Share button */}
            <WorkoutShareButton workout={workout} weightUnit={weightLabel} />

            {!useLocalWrites ? (
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                type="button"
                onClick={() => setReviseCompletedSets((v) => !v)}
              >
                {reviseCompletedSets
                  ? t("workouts.doneEditingSets")
                  : t("workouts.editCompletedSets")}
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="w-full shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
              onClick={() => void deleteCompletedWorkout()}
              disabled={deletingWorkout}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deletingWorkout ? t("workouts.deletingWorkout") : t("workouts.deleteCompleted")}
            </Button>
          </div>
        ) : null}
      </div>

      {useLocalWrites && isActive ? (
        <p
          className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
          role="status"
        >
          {t("workouts.offlineModeBanner")}
        </p>
      ) : null}

      {workout.workoutExercises.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("workouts.emptyExercises")}</p>
            {isActive && (
              <Button onClick={() => setPickerOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t("workouts.addExercise")}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={exerciseIds} strategy={verticalListSortingStrategy}>
              {exerciseIds
                .map((id) => workout.workoutExercises.find((we) => we.id === id))
                .filter((we): we is WorkoutExerciseData => !!we)
                .map((we) => (
                  <SortableExerciseCard
                    key={we.id}
                    we={we}
                    isActive={!!isActive}
                    workoutId={workoutId}
                    weightLabel={weightLabel}
                    useLocalWrites={useLocalWrites}
                    previousSets={previousLogs[we.exercise.id]}
                    onRemove={removeExercise}
                    onAddSet={addSet}
                    onMergeSet={mergeSet}
                    onRemoveSet={removeSetFromWe}
                    onSetCompleted={onSetCompleted}
                    patchSetOffline={patchSetOffline}
                    deleteSetOffline={deleteSetOffline}
                    t={t}
                    reviseCompletedSets={reviseCompletedSets}
                  />
                ))}
            </SortableContext>
          </DndContext>

          {isActive && (
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setPickerOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("workouts.addExercise")}
            </Button>
          )}
        </div>
      )}

      <ExercisePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handleAddExercise}
        loading={addingExercise}
      />

      <Dialog
        open={!!completionSummary}
        onOpenChange={(open) => {
          if (!open) setCompletionSummary(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("workouts.sessionSummaryTitle")}</DialogTitle>
            <DialogDescription className="space-y-2 pt-1 text-left">
              {completionSummary?.hasPrevious ? (
                <>
                  <p>
                    {t("workouts.sessionSummaryVolume", {
                      current: Math.round(completionSummary.currentVolume),
                    })}
                  </p>
                  <p>
                    {t("workouts.sessionSummaryDelta", {
                      delta:
                        completionSummary.volumeDelta >= 0
                          ? `+${Math.round(completionSummary.volumeDelta)}`
                          : String(Math.round(completionSummary.volumeDelta)),
                      pct:
                        completionSummary.volumeDeltaPct != null
                          ? (completionSummary.volumeDeltaPct > 0 ? "+" : "") +
                            completionSummary.volumeDeltaPct.toFixed(1)
                          : "—",
                    })}
                  </p>
                </>
              ) : (
                <p>{t("workouts.sessionSummaryNoPrevious")}</p>
              )}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!confirmState}
        onOpenChange={(open) => {
          if (!open) {
            confirmState?.resolve(false);
            setConfirmState(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirmState?.message}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                confirmState?.resolve(false);
                setConfirmState(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                confirmState?.resolve(true);
                setConfirmState(null);
              }}
            >
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
