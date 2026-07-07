import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android"]),
});

// POST /api/push-tokens — register (or refresh) this device's push token.
// Called from the native app after Capacitor's PushNotifications.register()
// resolves. Web session auth only — this never needs to be called by a
// non-browser client, unlike /api/health-data which also accepts API tokens.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // A token belongs to whichever device generated it — if it was previously
  // registered under a different user (e.g. re-installed and logged in as
  // someone else on the same physical device), reassign it rather than erroring.
  const row = await prisma.pushToken.upsert({
    where: { token: parsed.data.token },
    create: { userId: session.user.id, token: parsed.data.token, platform: parsed.data.platform },
    update: { userId: session.user.id, platform: parsed.data.platform },
  });

  return NextResponse.json({ data: { id: row.id } });
}

// DELETE /api/push-tokens — unregister on logout so a stale token doesn't
// keep receiving notifications meant for whoever logs in next on this device.
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = z.object({ token: z.string().min(1) }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  await prisma.pushToken.deleteMany({
    where: { token: parsed.data.token, userId: session.user.id },
  });

  return NextResponse.json({ success: true });
}
