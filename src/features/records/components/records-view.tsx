"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Trophy,
  Flame,
  Dumbbell,
  ChevronRight,
  Lock,
  Star,
  Zap,
  Award,
  TrendingUp,
  Sun,
  Shield,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n-provider";
import { exercisePath } from "@/lib/constants";
import { MUSCLE_GROUPS } from "@/lib/constants";
import type { PREntry, Achievement, AchievementId } from "@/services/personal-records";

// ─── Achievement config ───────────────────────────────────────────────────────

const ACHIEVEMENT_CONFIG: Record<
  AchievementId,
  { icon: React.ElementType; color: string; bg: string }
> = {
  firstWorkout:    { icon: Dumbbell,   color: "text-emerald-500", bg: "bg-emerald-500/10" },
  tenWorkouts:     { icon: TrendingUp, color: "text-sky-500",     bg: "bg-sky-500/10" },
  fiftyWorkouts:   { icon: Star,       color: "text-violet-500",  bg: "bg-violet-500/10" },
  hundredWorkouts: { icon: Shield,     color: "text-rose-500",    bg: "bg-rose-500/10" },
  firstPR:         { icon: Trophy,     color: "text-amber-500",   bg: "bg-amber-500/10" },
  tenPRs:          { icon: Award,      color: "text-amber-500",   bg: "bg-amber-500/10" },
  streak3:         { icon: Flame,      color: "text-orange-500",  bg: "bg-orange-500/10" },
  streak7:         { icon: Flame,      color: "text-orange-500",  bg: "bg-orange-500/10" },
  streak30:        { icon: Zap,        color: "text-yellow-500",  bg: "bg-yellow-500/10" },
  earlyBird:       { icon: Sun,        color: "text-amber-400",   bg: "bg-amber-400/10" },
};

// ─── Muscle group label map ───────────────────────────────────────────────────

const MG_LABEL: Record<string, string> = {
  CHEST: "Chest", BACK: "Back", SHOULDERS: "Shoulders",
  BICEPS: "Biceps", TRICEPS: "Triceps", LEGS: "Legs",
  GLUTES: "Glutes", CORE: "Core", FOREARMS: "Forearms",
  CALVES: "Calves", FULL_BODY: "Full Body", CARDIO: "Cardio", OTHER: "Other",
};

// ─── Components ───────────────────────────────────────────────────────────────

function StatPill({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-[var(--card)] px-5 py-4 ring-1 ring-[var(--sys-separator)] flex-1 min-w-[90px]">
      <Icon className={cn("h-5 w-5", color)} />
      <span className="text-[1.35rem] font-bold tracking-tight text-foreground leading-none">
        {value}
      </span>
      <span className="text-[0.65rem] font-medium uppercase tracking-widest text-[var(--sys-label3)]">
        {label}
      </span>
    </div>
  );
}

function AchievementBadge({ achievement }: { achievement: Achievement }) {
  const { t } = useI18n();
  const cfg = ACHIEVEMENT_CONFIG[achievement.id];
  const Icon = cfg.icon;
  const titleKey = `achievements.${achievement.id}` as Parameters<typeof t>[0];
  const descKey = `achievements.${achievement.id}Desc` as Parameters<typeof t>[0];

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-2xl p-3 ring-1 transition-all duration-200",
        achievement.unlocked
          ? "ring-[var(--sys-separator)] bg-[var(--card)]"
          : "ring-[var(--sys-separator)]/40 bg-[var(--card)]/50 opacity-40"
      )}
    >
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", achievement.unlocked ? cfg.bg : "bg-muted/50")}>
        {achievement.unlocked
          ? <Icon className={cn("h-5 w-5", cfg.color)} />
          : <Lock className="h-4 w-4 text-muted-foreground/50" />
        }
      </div>
      <span className="text-center text-[0.68rem] font-semibold leading-tight text-foreground">
        {achievement.unlocked ? t(titleKey) : t("achievements.locked")}
      </span>
      {achievement.unlocked && (
        <span className="text-center text-[0.6rem] leading-tight text-[var(--sys-label3)]">
          {t(descKey)}
        </span>
      )}
    </div>
  );
}

function PRCard({ pr, weightUnit }: { pr: PREntry; weightUnit: string }) {
  const unit = weightUnit.toLowerCase();
  const e1rm = pr.estimated1RM
    ? `${Math.round(pr.estimated1RM)} ${unit}`
    : "–";
  const date = new Date(pr.achievedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <Link
      href={exercisePath(pr.exerciseId)}
      className="group flex items-center gap-3 rounded-xl bg-[var(--card)] px-4 py-3.5 ring-1 ring-[var(--sys-separator)] transition-all hover:ring-primary/30 hover:shadow-sm"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
        <Trophy className="h-4.5 w-4.5 text-amber-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.85rem] font-semibold text-foreground leading-tight">
          {pr.exerciseName}
        </p>
        <p className="text-[0.72rem] text-[var(--sys-label3)] leading-tight mt-0.5">
          {pr.weight} {unit} × {pr.reps}  •  {date}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[0.85rem] font-bold text-primary leading-tight">
          {e1rm}
        </p>
        <p className="text-[0.65rem] uppercase tracking-wide text-[var(--sys-label3)] leading-tight">
          est. 1RM
        </p>
      </div>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--sys-label3)] transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

interface RecordsViewProps {
  records: PREntry[];
  achievements: Achievement[];
  weightUnit: string;
  streak: number;
  totalWorkouts: number;
  totalPRs: number;
}

export function RecordsView({
  records,
  achievements,
  weightUnit,
  streak,
  totalWorkouts,
  totalPRs,
}: RecordsViewProps) {
  const { t } = useI18n();
  const [activeGroup, setActiveGroup] = useState<string>("ALL");

  // Collect muscle groups that actually have records
  const presentGroups = useMemo(
    () => ["ALL", ...Array.from(new Set(records.map((r) => r.muscleGroup)))],
    [records]
  );

  const filtered = useMemo(
    () => activeGroup === "ALL" ? records : records.filter((r) => r.muscleGroup === activeGroup),
    [records, activeGroup]
  );

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="space-y-6 pb-4">

      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("records.title")}</h1>
        <p className="text-sm text-[var(--sys-label2)] mt-0.5">{t("records.subtitle")}</p>
      </div>

      {/* ── Stats row ───────────────────────────────────── */}
      <div className="flex gap-3">
        <StatPill icon={Dumbbell}  label="Workouts" value={totalWorkouts} color="text-sky-500" />
        <StatPill icon={Trophy}    label="Records"  value={totalPRs}      color="text-amber-500" />
        <StatPill icon={Flame}     label="Streak"   value={`${streak}d`}  color="text-orange-500" />
        <StatPill icon={Award}     label="Badges"   value={`${unlockedCount}/${achievements.length}`} color="text-violet-500" />
      </div>

      {/* ── Achievements ────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-base font-semibold">{t("achievements.title")}</h2>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {achievements.map((a) => (
            <AchievementBadge key={a.id} achievement={a} />
          ))}
        </div>
      </section>

      {/* ── Personal Records ─────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-base font-semibold">{t("records.title")}</h2>

        {/* Muscle group filter pills */}
        {presentGroups.length > 2 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {presentGroups.map((mg) => (
              <button
                key={mg}
                type="button"
                onClick={() => setActiveGroup(mg)}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1 text-[0.75rem] font-semibold transition-colors",
                  activeGroup === mg
                    ? "bg-primary text-primary-foreground"
                    : "bg-[var(--sys-fill)] text-[var(--sys-label2)] hover:bg-[var(--sys-fill2)]"
                )}
              >
                {mg === "ALL" ? t("records.allGroups") : (MG_LABEL[mg] ?? mg)}
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="rounded-2xl bg-[var(--card)] px-6 py-12 text-center ring-1 ring-[var(--sys-separator)]">
            <Trophy className="mx-auto mb-3 h-8 w-8 text-[var(--sys-label3)]" />
            <p className="text-sm text-[var(--sys-label2)]">{t("records.noRecords")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((pr) => (
              <PRCard key={pr.id} pr={pr} weightUnit={weightUnit} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
