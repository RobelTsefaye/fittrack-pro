import { google } from "@ai-sdk/google";
import { streamText } from "ai";
import { auth } from "@/lib/auth";
import { buildCoachContext, buildTrainingSummary } from "@/features/ai/context";

export const maxDuration = 10; // Vercel Hobby plan max

function buildSystemPrompt(
  ctx: Awaited<ReturnType<typeof buildCoachContext>>,
  summary: Awaited<ReturnType<typeof buildTrainingSummary>>
): string {
  const name = summary.athlete.displayName;
  const unit = summary.athlete.weightUnit.toLowerCase();
  const streak = summary.snapshot.workoutStreakDays;
  const totalWorkouts = summary.snapshot.totalWorkouts;
  const prs = summary.snapshot.personalRecordsCount;

  const weekRows = summary.window.weekBuckets
    .map(
      (w) =>
        `  ${w.weekStart}: ${w.completedWorkouts} workouts, ${w.volumeLoad}${unit} volume, ${w.workingSets} working sets`
    )
    .join("\n");

  const topEx = summary.topExercisesByVolume
    .slice(0, 8)
    .map((e) => `  ${e.name}: ${e.volumeLoad}${unit}`)
    .join("\n");

  const recentPRs = summary.recentPersonalRecords
    .slice(0, 5)
    .map(
      (p) =>
        `  ${p.exerciseName}: ${p.weight}${unit} × ${p.reps} reps` +
        (p.estimated1RM ? ` (est. 1RM: ${p.estimated1RM}${unit})` : "") +
        ` on ${p.achievedAt.split("T")[0]}`
    )
    .join("\n");

  const activeWorkouts =
    ctx.activeWorkouts.length > 0
      ? ctx.activeWorkouts
          .map((w) => `  "${w.name ?? "Unnamed"}" — exercises: ${w.exerciseNames.join(", ")}`)
          .join("\n")
      : "  None currently active.";

  const latestBW = ctx.latestBodyWeight
    ? `${ctx.latestBodyWeight.weight}${unit} on ${String(ctx.latestBodyWeight.date).split("T")[0]}`
    : "Not logged yet.";

  const nextUp =
    ctx.planRotation
      .filter((p) => p.suggestedNext)
      .map(
        (p) =>
          `  Plan "${p.planName}" → "${p.suggestedNext!.sessionName}" (exercises: ${p.suggestedNext!.plannedExercises.map((e) => e.name).join(", ")})`
      )
      .join("\n") || "  No plans configured.";

  return `You are a personal strength & fitness coach AI built into FitTrack Pro.
You have full read access to ${name}'s training history. Be concise, practical, and motivating.
Never give medical advice — always recommend seeing a professional for injuries or health concerns.
Respond in the same language the user writes in (German or English). Keep answers short and direct — no fluff.

━━━ ATHLETE PROFILE ━━━
Name: ${name}
Weight unit: ${unit}
Current streak: ${streak} day(s)
Total completed workouts: ${totalWorkouts}
Personal records logged: ${prs}
Latest body weight: ${latestBW}

━━━ LAST ${summary.windowWeeks} WEEKS (week-by-week) ━━━
${weekRows}

━━━ TOP EXERCISES BY VOLUME (last ${summary.windowWeeks} weeks) ━━━
${topEx || "  No data yet."}

━━━ RECENT PERSONAL RECORDS ━━━
${recentPRs || "  No PRs logged yet."}

━━━ ACTIVE SESSION ━━━
${activeWorkouts}

━━━ SUGGESTED NEXT WORKOUT ━━━
${nextUp}`;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages } = (await req.json()) as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  };

  const [coachCtx, trainingSummary] = await Promise.all([
    buildCoachContext(session.user.id),
    buildTrainingSummary(session.user.id, 8),
  ]);

  const systemPrompt = buildSystemPrompt(coachCtx, trainingSummary);

  const result = streamText({
    model: google("gemini-2.0-flash"),
    system: systemPrompt,
    messages,
    maxOutputTokens: 1024,
  });

  return result.toUIMessageStreamResponse();
}
