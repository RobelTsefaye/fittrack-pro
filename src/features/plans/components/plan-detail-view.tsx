"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/app-link";
import { useRouter } from "next/navigation";
import { workoutHref } from "@/lib/workout-href";
import { ArrowLeft, GripVertical, Plus, Trash2, Play } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROUTES, exercisePath } from "@/lib/constants";
import { notifyActiveWorkoutChanged } from "@/components/layout/active-workout-banner";
import { loadPlanDetailCache, savePlanDetailCache } from "@/lib/offline/screen-caches";
import { startPlanSessionOffline } from "@/lib/offline/plan-session-offline";
import { useI18n } from "@/lib/i18n-provider";
import { ExercisePickerDialog } from "@/features/workouts/components/exercise-picker-dialog";

type ExerciseRef = {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
};

type Pse = {
  id: string;
  exerciseId: string;
  order: number;
  targetSets: number;
  exercise: ExerciseRef;
};

type PlanSession = {
  id: string;
  name: string;
  order: number;
  notes: string | null;
  exercises: Pse[];
};

type PlanDetail = {
  id: string;
  name: string;
  description: string | null;
  sessions: PlanSession[];
};

// ── Sortable exercise row ────────────────────────────────────────────────────

interface SortablePseRowProps {
  pse: Pse;
  onRemove: (pseId: string) => void;
  onUpdateTargetSets: (pseId: string, value: string) => void;
  targetSetsLabel: string;
}

function SortablePseRow({
  pse,
  onRemove,
  onUpdateTargetSets,
  targetSetsLabel,
}: SortablePseRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: pse.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm"
    >
      <button
        type="button"
        className="cursor-grab touch-none shrink-0 text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Link
        href={exercisePath(pse.exerciseId)}
        className="font-medium flex-1 min-w-[120px] hover:underline underline-offset-2"
      >
        {pse.exercise.name}
      </Link>
      <div className="flex items-center gap-2">
        <Label htmlFor={`sets-${pse.id}`} className="text-muted-foreground text-xs">
          {targetSetsLabel}
        </Label>
        <Input
          id={`sets-${pse.id}`}
          type="number"
          min={1}
          max={20}
          className="h-8 w-16"
          defaultValue={pse.targetSets}
          key={`${pse.id}-${pse.targetSets}`}
          onBlur={(e) => {
            if (e.target.value !== String(pse.targetSets)) {
              onUpdateTargetSets(pse.id, e.target.value);
            }
          }}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-destructive hover:text-destructive"
        onClick={() => onRemove(pse.id)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

// ── Sortable session card ────────────────────────────────────────────────────

interface SortableSessionCardProps {
  s: PlanSession;
  pseIds: string[];
  exerciseSensors: ReturnType<typeof useSensors>;
  startingId: string | null;
  onStart: (sessionId: string) => void;
  onPickExercise: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRemovePse: (pseId: string) => void;
  onUpdateTargetSets: (pseId: string, value: string) => void;
  onExerciseDragEnd: (sessionId: string, event: DragEndEvent) => void;
  t: (key: string) => string;
}

function SortableSessionCard({
  s,
  pseIds,
  exerciseSensors,
  startingId,
  onStart,
  onPickExercise,
  onDeleteSession,
  onRemovePse,
  onUpdateTargetSets,
  onExerciseDragEnd,
  t,
}: SortableSessionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: s.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };

  const byId = new Map(s.exercises.map((p) => [p.id, p]));

  return (
    <li ref={setNodeRef} style={style}>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              className="cursor-grab touch-none shrink-0 text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
              aria-label="Drag to reorder day"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <CardTitle className="text-base">{s.name}</CardTitle>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onStart(s.id)} disabled={startingId === s.id}>
              <Play className="mr-1 h-3.5 w-3.5" />
              {startingId === s.id ? t("plans.starting") : t("plans.startThisDay")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onPickExercise(s.id)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t("workouts.addExercise")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => onDeleteSession(s.id)}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">{t("plans.removeDay")}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t("plans.exercisesInDay")}
          </p>
          {s.exercises.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("plans.noExercisesInDay")}</p>
          ) : (
            <DndContext
              sensors={exerciseSensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => onExerciseDragEnd(s.id, e)}
            >
              <SortableContext items={pseIds} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2">
                  {pseIds
                    .map((id) => byId.get(id))
                    .filter((p): p is Pse => !!p)
                    .map((pse) => (
                      <SortablePseRow
                        key={pse.id}
                        pse={pse}
                        onRemove={onRemovePse}
                        onUpdateTargetSets={onUpdateTargetSets}
                        targetSetsLabel={t("plans.targetSets")}
                      />
                    ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>
    </li>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface PlanDetailViewProps {
  planId: string;
}

export function PlanDetailView({ planId }: PlanDetailViewProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [planNameDraft, setPlanNameDraft] = useState("");
  const [savingPlanName, setSavingPlanName] = useState(false);

  const [dayDialogOpen, setDayDialogOpen] = useState(false);
  const [dayName, setDayName] = useState("");
  const [addingDay, setAddingDay] = useState(false);

  const [pickerSessionId, setPickerSessionId] = useState<string | null>(null);
  const [addingExercise, setAddingExercise] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);

  // DnD order state
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [pseIdsBySession, setPseIdsBySession] = useState<Map<string, string[]>>(new Map());
  const sessionReorderPending = useRef(false);
  const pseReorderPending = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const cached = await loadPlanDetailCache<PlanDetail>(planId);
      if (cached) {
        setPlan(cached);
        setPlanNameDraft(cached.name);
      } else {
        setError(t("plans.loadFailed"));
      }
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/plans/${planId}`);
      if (res.status === 404) {
        setPlan(null);
        setError(t("plans.planNotFound"));
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError(t("plans.loadFailed"));
        setLoading(false);
        return;
      }
      const json = await res.json();
      const p = json.data as PlanDetail;
      setPlan(p);
      setPlanNameDraft(p.name);
      void savePlanDetailCache(planId, p);
    } catch {
      const cached = await loadPlanDetailCache<PlanDetail>(planId);
      if (cached) {
        setPlan(cached);
        setPlanNameDraft(cached.name);
      } else {
        setError(t("plans.loadFailed"));
      }
    }
    setLoading(false);
  }, [planId, t]);

  useEffect(() => {
    load();
  }, [load]);

  // Sync order state whenever plan is loaded
  useEffect(() => {
    if (!plan) return;
    setSessionIds([...plan.sessions].sort((a, b) => a.order - b.order).map((s) => s.id));
    const map = new Map<string, string[]>();
    for (const s of plan.sessions) {
      map.set(s.id, [...s.exercises].sort((a, b) => a.order - b.order).map((p) => p.id));
    }
    setPseIdsBySession(map);
  }, [plan]);

  // ── Session drag ────────────────────────────────────────────────────────

  async function handleSessionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !plan) return;

    const oldIdx = sessionIds.indexOf(active.id as string);
    const newIdx = sessionIds.indexOf(over.id as string);
    const newIds = arrayMove(sessionIds, oldIdx, newIdx);
    setSessionIds(newIds);

    setPlan((prev) => {
      if (!prev) return prev;
      const byId = new Map(prev.sessions.map((s) => [s.id, s]));
      return {
        ...prev,
        sessions: newIds.map((id, i) => ({ ...byId.get(id)!, order: i + 1 })),
      };
    });

    if (sessionReorderPending.current) return;
    sessionReorderPending.current = true;
    try {
      await fetch(`/api/plans/${planId}/sessions/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: newIds }),
      });
    } finally {
      sessionReorderPending.current = false;
    }
  }

  // ── Exercise drag ───────────────────────────────────────────────────────

  async function handleExerciseDragEnd(sessionId: string, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentIds = pseIdsBySession.get(sessionId) ?? [];
    const oldIdx = currentIds.indexOf(active.id as string);
    const newIdx = currentIds.indexOf(over.id as string);
    const newIds = arrayMove(currentIds, oldIdx, newIdx);

    setPseIdsBySession((prev) => new Map([...prev, [sessionId, newIds]]));
    setPlan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sessions: prev.sessions.map((s) => {
          if (s.id !== sessionId) return s;
          const byId = new Map(s.exercises.map((p) => [p.id, p]));
          return {
            ...s,
            exercises: newIds.map((id, i) => ({ ...byId.get(id)!, order: i + 1 })),
          };
        }),
      };
    });

    if (pseReorderPending.current) return;
    pseReorderPending.current = true;
    try {
      await fetch(`/api/plan-sessions/${sessionId}/exercises/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: newIds }),
      });
    } finally {
      pseReorderPending.current = false;
    }
  }

  // ── CRUD handlers ───────────────────────────────────────────────────────

  async function savePlanName() {
    const trimmed = planNameDraft.trim();
    if (!trimmed || !plan || trimmed === plan.name) return;
    setSavingPlanName(true);
    await fetch(`/api/plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setSavingPlanName(false);
    await load();
  }

  async function deletePlan() {
    if (!confirm(t("plans.deletePlanConfirm"))) return;
    const res = await fetch(`/api/plans/${planId}`, { method: "DELETE" });
    if (res.ok) router.push(ROUTES.plans);
  }

  async function addDay(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = dayName.trim();
    if (!trimmed) return;
    setAddingDay(true);
    const res = await fetch(`/api/plans/${planId}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setAddingDay(false);
    if (!res.ok) return;
    setDayDialogOpen(false);
    setDayName("");
    await load();
  }

  async function deleteSession(sessionId: string) {
    if (!confirm(t("plans.removeDayConfirm"))) return;
    await fetch(`/api/plan-sessions/${sessionId}`, { method: "DELETE" });
    await load();
  }

  async function handleAddExercise(exercise: { id: string }) {
    if (!pickerSessionId) return;
    setAddingExercise(true);
    const res = await fetch(`/api/plan-sessions/${pickerSessionId}/exercises`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseId: exercise.id }),
    });
    setAddingExercise(false);
    setPickerSessionId(null);
    if (res.ok) await load();
  }

  async function updateTargetSets(pseId: string, value: string) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n) || n < 1 || n > 20) return;
    await fetch(`/api/plan-session-exercises/${pseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetSets: n }),
    });
    await load();
  }

  async function removePse(pseId: string) {
    await fetch(`/api/plan-session-exercises/${pseId}`, { method: "DELETE" });
    await load();
  }

  async function startSessionOffline(sessionId: string) {
    const session = plan?.sessions.find((s) => s.id === sessionId);
    if (!session) return;
    await startPlanSessionOffline({
      id: session.id,
      name: session.name,
      exercises: session.exercises.map((pse) => ({
        exerciseId: pse.exerciseId,
        targetSets: pse.targetSets,
        exercise: pse.exercise,
      })),
    });
    notifyActiveWorkoutChanged();
    // Client-generated ids can't be opened directly (see workout-href.ts) —
    // land on /workouts/new instead, whose mount effect already picks up a
    // just-queued active offline workout and renders it inline.
    router.push(ROUTES.newWorkout);
  }

  async function startSession(sessionId: string) {
    setStartingId(sessionId);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await startSessionOffline(sessionId);
      setStartingId(null);
      return;
    }
    try {
      const res = await fetch(`/api/plan-sessions/${sessionId}/start`, { method: "POST" });
      if (!res.ok) {
        setStartingId(null);
        return;
      }
      const json = await res.json();
      const id = json.data?.id as string | undefined;
      if (id) {
        notifyActiveWorkoutChanged();
        router.push(workoutHref(id));
      }
    } catch {
      await startSessionOffline(sessionId);
    }
    setStartingId(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted/80" />
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="space-y-4">
        <Link
          href={ROUTES.plans}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex gap-1 -ml-2")}
        >
          <ArrowLeft className="h-4 w-4" />
          {t("plans.backToPlans")}
        </Link>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {error ?? t("plans.planNotFound")}
          </CardContent>
        </Card>
      </div>
    );
  }

  const orderedSessions = sessionIds
    .map((id) => plan.sessions.find((s) => s.id === id))
    .filter((s): s is PlanSession => !!s);

  return (
    <div className="space-y-6">
      <Link
        href={ROUTES.plans}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex gap-1 -ml-2")}
      >
        <ArrowLeft className="h-4 w-4" />
        {t("plans.backToPlans")}
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">{plan.name}</h1>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2 flex-1 max-w-xl">
          <Label className="text-muted-foreground text-xs">{t("plans.renamePlan")}</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              value={planNameDraft}
              onChange={(e) => setPlanNameDraft(e.target.value)}
              className="max-w-md"
              maxLength={120}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={savePlanName}
              disabled={savingPlanName || planNameDraft.trim() === plan.name}
            >
              {savingPlanName ? t("common.saving") : t("plans.savePlanName")}
            </Button>
          </div>
          {plan.description ? (
            <p className="text-sm text-muted-foreground">{plan.description}</p>
          ) : null}
        </div>
        <Button variant="destructive" className="shrink-0" onClick={deletePlan}>
          {t("plans.deletePlan")}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("plans.workoutDaysTitle")}</h2>
        <Button variant="outline" size="sm" onClick={() => setDayDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          {t("plans.addWorkoutDay")}
        </Button>
      </div>

      {plan.sessions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("plans.emptyHint")}
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleSessionDragEnd}
        >
          <SortableContext items={sessionIds} strategy={verticalListSortingStrategy}>
            <ul className="space-y-4">
              {orderedSessions.map((s) => (
                <SortableSessionCard
                  key={s.id}
                  s={s}
                  pseIds={pseIdsBySession.get(s.id) ?? s.exercises.map((p) => p.id)}
                  exerciseSensors={sensors}
                  startingId={startingId}
                  onStart={startSession}
                  onPickExercise={setPickerSessionId}
                  onDeleteSession={deleteSession}
                  onRemovePse={removePse}
                  onUpdateTargetSets={updateTargetSets}
                  onExerciseDragEnd={handleExerciseDragEnd}
                  t={t}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <Dialog open={dayDialogOpen} onOpenChange={setDayDialogOpen}>
        <DialogContent>
          <form onSubmit={addDay}>
            <DialogHeader>
              <DialogTitle>{t("plans.newDayTitle")}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="day-name">{t("plans.dayName")}</Label>
              <Input
                id="day-name"
                className="mt-2"
                value={dayName}
                onChange={(e) => setDayName(e.target.value)}
                placeholder={t("plans.dayNamePlaceholder")}
                maxLength={100}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDayDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={addingDay}>
                {addingDay ? t("common.saving") : t("plans.addDay")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ExercisePickerDialog
        open={!!pickerSessionId}
        onOpenChange={(o) => !o && setPickerSessionId(null)}
        onSelect={handleAddExercise}
        loading={addingExercise}
      />
    </div>
  );
}
