import { Suspense } from "react";
import Link from "next/link";
import {
  Trophy, Flame, Dumbbell, Lock, Star, Zap, Award, TrendingUp, Sun, Shield, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { getAllPersonalRecords, getAchievements, type AchievementId } from "@/services/personal-records";
import { getDashboardSummary } from "@/features/dashboard/queries";

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

async function AchievementsData({ userId }: { userId: string }) {
  const summary = await getDashboardSummary(userId);
  const achievements = await getAchievements(userId, summary.workoutStreakDays);

  const unlocked = achievements.filter((a) => a.unlocked);
  const locked = achievements.filter((a) => !a.unlocked);

  return (
    <div className="ios-group px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Achievements</h2>
          <p className="text-[0.72rem] text-[var(--sys-label3)]">
            {unlocked.length}/{achievements.length} unlocked
          </p>
        </div>
        <Link
          href={ROUTES.records}
          className="flex items-center gap-0.5 text-[0.78rem] font-medium text-primary"
        >
          View all <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {/* Show all unlocked first, then first few locked */}
        {[...unlocked, ...locked.slice(0, Math.max(0, 10 - unlocked.length))].map((a) => {
          const cfg = ACHIEVEMENT_CONFIG[a.id];
          const Icon = cfg.icon;
          return (
            <div
              key={a.id}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl p-2 ring-1 transition-all",
                a.unlocked
                  ? "ring-[var(--sys-separator)] bg-[var(--card)]"
                  : "ring-[var(--sys-separator)]/30 opacity-35"
              )}
            >
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", a.unlocked ? cfg.bg : "bg-muted/40")}>
                {a.unlocked
                  ? <Icon className={cn("h-4 w-4", cfg.color)} />
                  : <Lock className="h-3.5 w-3.5 text-muted-foreground/40" />
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AchievementsCard({ userId }: { userId: string }) {
  return (
    <Suspense fallback={
      <div className="ios-group px-4 py-4 animate-pulse">
        <div className="mb-3 h-5 w-32 rounded bg-muted/60" />
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-muted/40" />
          ))}
        </div>
      </div>
    }>
      <AchievementsData userId={userId} />
    </Suspense>
  );
}
