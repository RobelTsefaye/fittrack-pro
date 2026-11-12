import { beforeEach, describe, expect, it, vi } from "vitest";

/** POST /api/workouts/[id]/complete: nur Auth-Charakterisierung; belegte Findings als todo (FT-TEST-01). */

const prisma = vi.hoisted(() => ({ workout: { findFirst: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma }));

const resolveUserId = vi.hoisted(() => vi.fn<() => Promise<string | null>>());
vi.mock("@/lib/api-auth", () => ({ resolveUserIdForDataApi: () => resolveUserId() }));

const { POST } = await import("@/app/api/workouts/[id]/complete/route");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/workouts/[id]/complete", () => {
  it("ohne Session/Token: 401 und kein DB-Zugriff", async () => {
    resolveUserId.mockResolvedValue(null);
    const res = await POST(
      new Request("http://x/api/workouts/w1/complete", { method: "POST" }) as never,
      { params: Promise.resolve({ id: "w1" }) } as never
    );
    expect(res.status).toBe(401);
    expect(prisma.workout.findFirst).not.toHaveBeenCalled();
  });

  it.todo(
    "FT-PERF-01 (Characterization): je Arbeitssatz je 2-3 sequentielle PR-Queries (N+1) vor der Antwort"
  );
  it.todo(
    "FT-PERF-01 (Reihenfolge): Rampe mit mehreren Rekorden in einer Einheit; setsForPr hat kein orderBy, Ist-Reihenfolge nicht garantiert"
  );
  it.todo(
    "FT-PERF-05: bis zu 7 sequentielle Queries je Satz-PATCH (Query-Anzahl festschreiben, bevor optimiert wird)"
  );
});
