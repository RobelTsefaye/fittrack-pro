import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import {
  findExerciseVisibleToUser,
  fetchCompletedSetsForExercise,
  computeProgressBySession,
  computeVolumeBySession,
  mapSetsToHistoryRows,
} from "@/features/exercises/history-core";

export async function GET(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const exerciseId = req.nextUrl.searchParams.get("exerciseId");
  if (!exerciseId) {
    return NextResponse.json({ error: "Missing exerciseId" }, { status: 400 });
  }

  const exercise = await findExerciseVisibleToUser(exerciseId, userId);
  if (!exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  const sets = await fetchCompletedSetsForExercise(exerciseId, userId);

  return NextResponse.json({
    data: {
      schemaVersion: "1.0",
      kind: "exercise-history",
      generatedAt: new Date().toISOString(),
      exercise,
      progressBySession: computeProgressBySession(sets),
      volumeBySession: computeVolumeBySession(sets),
      sets: mapSetsToHistoryRows(sets),
    },
    meta: { endpoint: "exercise-history", exerciseId, setCount: sets.length },
  });
}
