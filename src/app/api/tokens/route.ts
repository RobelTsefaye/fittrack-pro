import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import {
  apiTokenPrefixLabel,
  generateApiTokenSecret,
  hashApiTokenSecret,
} from "@/lib/api-token-crypto";

const createSchema = z.object({
  name: z.string().trim().max(80).optional(),
});

export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await prisma.apiToken.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });

    return NextResponse.json({ data });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api/tokens GET]", e);
    return NextResponse.json(
      {
        error: "Failed to list API tokens",
        detail: message,
        hint: "Run `npx prisma migrate deploy` (or `npx prisma migrate dev`) so the `api_tokens` table exists.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const secret = generateApiTokenSecret();
    const tokenHash = hashApiTokenSecret(secret);
    const tokenPrefix = apiTokenPrefixLabel(secret);

    const row = await prisma.apiToken.create({
      data: {
        userId,
        name: parsed.data.name?.length ? parsed.data.name : null,
        tokenHash,
        tokenPrefix,
      },
      select: { id: true, name: true, tokenPrefix: true, createdAt: true },
    });

    return NextResponse.json({
      data: {
        ...row,
        token: secret,
        warning: "Copy this token now. It will not be shown again.",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api/tokens POST]", e);
    return NextResponse.json(
      {
        error: "Failed to create API token",
        detail: message,
        hint: "If the database was never migrated for API tokens, run `npx prisma migrate deploy` or `npx prisma migrate dev`.",
      },
      { status: 500 }
    );
  }
}
