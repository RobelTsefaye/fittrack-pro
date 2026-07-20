import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entries = await prisma.bodyMeasurement.findMany({
    where: { userId },
    orderBy: { date: "asc" },
  });

  return NextResponse.json({
    data: {
      schemaVersion: "1.0",
      kind: "body-measurements",
      generatedAt: new Date().toISOString(),
      entries: entries.map((e) => ({
        date: e.date.toISOString().slice(0, 10),
        neck: e.neck,
        chest: e.chest,
        leftArm: e.leftArm,
        rightArm: e.rightArm,
        waist: e.waist,
        hips: e.hips,
        leftThigh: e.leftThigh,
        rightThigh: e.rightThigh,
        notes: e.notes,
      })),
    },
    meta: { endpoint: "body-measurements", count: entries.length },
  });
}
