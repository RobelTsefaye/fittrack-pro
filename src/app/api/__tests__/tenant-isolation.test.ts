import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mandantentrennung (FT-TEST-02, vgl. FT-SEC-12 in docs/audit/02-security.md).
 *
 * Teil 1 (Laufzeit, gemocktes Prisma): Für Routen mit Zugriff über eine Ressourcen-`id`
 *   gilt: Die Abfrage enthält den `userId` des Aufrufers, eine fremde Ressource (Lookup
 *   liefert `null`) ergibt 404 und löst keine Schreiboperation aus.
 * Teil 2 (Quelltext-Scan, wie route-auth-coverage.test.ts): Jede `where`-Klausel mit `id`
 *   ohne `userId` in `src/app/api` und `src/services` muss in der ALLOWLIST mit Begründung
 *   und exakter Anzahl stehen. Neue Stellen machen den Test rot, bis sie geprüft sind.
 *   Grenze: ein Textscan belegt nicht, dass die Vorabprüfung auf jedem Pfad greift.
 */

const USER = "user-A";

const mocks = vi.hoisted(() => {
  const fns = new Map<string, ReturnType<typeof import("vitest").vi.fn>>();
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get(_t, method: string) {
          const key = `${name}.${method}`;
          let fn = fns.get(key);
          if (!fn) {
            fn = vi.fn(async () => null);
            fns.set(key, fn);
          }
          return fn;
        },
      }
    );
  const prisma = new Proxy({} as Record<string, unknown>, {
    get(_t, name: string) {
      return model(name);
    },
  });
  return { fns, prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/api-auth", () => ({ resolveUserIdForDataApi: async () => USER }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (f: unknown) => f }));

import { DELETE as tokenDelete } from "../tokens/[id]/route";
import {
  GET as workoutGet,
  PATCH as workoutPatch,
  DELETE as workoutDelete,
} from "../workouts/[id]/route";
import { POST as workoutComplete } from "../workouts/[id]/complete/route";
import { GET as workoutPrevLogs } from "../workouts/[id]/previous-logs/route";
import { PATCH as workoutRestAdjust } from "../workouts/[id]/rest-timer-adjust/route";
import { POST as workoutAddExercise } from "../workouts/[id]/exercises/route";
import { PATCH as weAddPatch, DELETE as weDelete } from "../workouts/[id]/exercises/[weId]/route";
import { PATCH as setPatch, DELETE as setDelete } from "../workouts/[id]/sets/[setId]/route";
import { GET as planGet, PATCH as planPatch, DELETE as planDelete } from "../plans/[planId]/route";
import { PATCH as psPatch, DELETE as psDelete } from "../plan-sessions/[sessionId]/route";
import { POST as psAddExercise } from "../plan-sessions/[sessionId]/exercises/route";
import { PATCH as psePatch, DELETE as pseDelete } from "../plan-session-exercises/[pseId]/route";
import { PATCH as bwPatch, DELETE as bwDelete } from "../body-weight/[id]/route";
import { DELETE as cardioDelete } from "../health/cardio/[id]/route";
import {
  GET as exerciseGet,
  PATCH as exercisePatch,
  DELETE as exerciseDelete,
} from "../exercises/[id]/route";
import { PATCH as nutritionPatch } from "../nutrition-plan/[id]/route";

type Handler = (req: never, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const h = (f: unknown) => f as Handler;

const fn = (key: string) => {
  const f = mocks.fns.get(key);
  if (!f) throw new Error(`Mock ${key} wurde nie aufgerufen`);
  return f;
};
const wasCalled = (key: string) => (mocks.fns.get(key)?.mock.calls.length ?? 0) > 0;
const scopedToCaller = (key: string) =>
  fn(key).mock.calls.some((c) =>
    JSON.stringify((c[0] as { where?: unknown })?.where).includes(`"userId":"${USER}"`)
  );

const OTHER_ID = "11111111-1111-4111-8111-111111111111";
const EXERCISE_ID = "22222222-2222-4222-8222-222222222222";
const req = (method: string, body: unknown = {}) =>
  new Request("http://localhost/api/x", {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  mocks.fns.forEach((f) => {
    f.mockReset();
    f.mockImplementation(async () => null);
  });
});

/** Fremde Ressource: der Lookup liefert null. Erwartung: userId im Lookup, 404, keine Schreibzugriffe. */
const CASES: Array<{
  name: string;
  handler: Handler;
  method: string;
  params: Record<string, string>;
  lookup: string;
  body?: unknown;
}> = [
  {
    name: "tokens/[id] DELETE",
    handler: h(tokenDelete),
    method: "DELETE",
    params: { id: OTHER_ID },
    lookup: "apiToken.findFirst",
  },
  {
    name: "workouts/[id] GET",
    handler: h(workoutGet),
    method: "GET",
    params: { id: OTHER_ID },
    lookup: "workout.findFirst",
  },
  {
    name: "workouts/[id] PATCH",
    handler: h(workoutPatch),
    method: "PATCH",
    params: { id: OTHER_ID },
    lookup: "workout.findFirst",
  },
  {
    name: "workouts/[id] DELETE",
    handler: h(workoutDelete),
    method: "DELETE",
    params: { id: OTHER_ID },
    lookup: "workout.findFirst",
  },
  {
    name: "workouts/[id]/complete POST",
    handler: h(workoutComplete),
    method: "POST",
    params: { id: OTHER_ID },
    lookup: "workout.findFirst",
  },
  {
    name: "workouts/[id]/previous-logs GET",
    handler: h(workoutPrevLogs),
    method: "GET",
    params: { id: OTHER_ID },
    lookup: "workout.findFirst",
  },
  {
    name: "workouts/[id]/rest-timer-adjust PATCH",
    handler: h(workoutRestAdjust),
    method: "PATCH",
    params: { id: OTHER_ID },
    lookup: "workout.findFirst",
  },
  {
    name: "workouts/[id]/exercises POST",
    handler: h(workoutAddExercise),
    method: "POST",
    params: { id: OTHER_ID },
    lookup: "workout.findFirst",
  },
  {
    name: "workouts/[id]/exercises/[weId] PATCH",
    handler: h(weAddPatch),
    method: "PATCH",
    params: { id: OTHER_ID, weId: OTHER_ID },
    lookup: "workout.findFirst",
    body: { supersetGroup: 1 },
  },
  {
    name: "workouts/[id]/exercises/[weId] DELETE",
    handler: h(weDelete),
    method: "DELETE",
    params: { id: OTHER_ID, weId: OTHER_ID },
    lookup: "workout.findFirst",
  },
  {
    name: "workouts/[id]/sets/[setId] PATCH",
    handler: h(setPatch),
    method: "PATCH",
    params: { id: OTHER_ID, setId: OTHER_ID },
    lookup: "set.findFirst",
  },
  {
    name: "workouts/[id]/sets/[setId] DELETE",
    handler: h(setDelete),
    method: "DELETE",
    params: { id: OTHER_ID, setId: OTHER_ID },
    lookup: "set.findFirst",
  },
  {
    name: "plans/[planId] GET",
    handler: h(planGet),
    method: "GET",
    params: { planId: OTHER_ID },
    lookup: "workoutPlan.findFirst",
  },
  {
    name: "plans/[planId] PATCH",
    handler: h(planPatch),
    method: "PATCH",
    params: { planId: OTHER_ID },
    lookup: "workoutPlan.findFirst",
  },
  {
    name: "plans/[planId] DELETE",
    handler: h(planDelete),
    method: "DELETE",
    params: { planId: OTHER_ID },
    lookup: "workoutPlan.findFirst",
  },
  {
    name: "plan-sessions/[sessionId] PATCH",
    handler: h(psPatch),
    method: "PATCH",
    params: { sessionId: OTHER_ID },
    lookup: "planSession.findFirst",
  },
  {
    name: "plan-sessions/[sessionId] DELETE",
    handler: h(psDelete),
    method: "DELETE",
    params: { sessionId: OTHER_ID },
    lookup: "planSession.findFirst",
  },
  {
    name: "plan-sessions/[sessionId]/exercises POST",
    handler: h(psAddExercise),
    method: "POST",
    params: { sessionId: OTHER_ID },
    lookup: "planSession.findFirst",
  },
  {
    name: "plan-session-exercises/[pseId] PATCH",
    handler: h(psePatch),
    method: "PATCH",
    params: { pseId: OTHER_ID },
    lookup: "planSessionExercise.findFirst",
  },
  {
    name: "plan-session-exercises/[pseId] DELETE",
    handler: h(pseDelete),
    method: "DELETE",
    params: { pseId: OTHER_ID },
    lookup: "planSessionExercise.findFirst",
  },
  {
    name: "body-weight/[id] PATCH",
    handler: h(bwPatch),
    method: "PATCH",
    params: { id: OTHER_ID },
    lookup: "bodyWeight.findFirst",
  },
  {
    name: "body-weight/[id] DELETE",
    handler: h(bwDelete),
    method: "DELETE",
    params: { id: OTHER_ID },
    lookup: "bodyWeight.findFirst",
  },
  {
    name: "health/cardio/[id] DELETE",
    handler: h(cardioDelete),
    method: "DELETE",
    params: { id: OTHER_ID },
    lookup: "appleWorkout.findFirst",
  },
  {
    name: "exercises/[id] GET",
    handler: h(exerciseGet),
    method: "GET",
    params: { id: OTHER_ID },
    lookup: "exercise.findFirst",
  },
  {
    name: "exercises/[id] PATCH",
    handler: h(exercisePatch),
    method: "PATCH",
    params: { id: OTHER_ID },
    lookup: "exercise.findFirst",
  },
  {
    name: "exercises/[id] DELETE",
    handler: h(exerciseDelete),
    method: "DELETE",
    params: { id: OTHER_ID },
    lookup: "exercise.findFirst",
  },
];

const WRITE_METHODS = [
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
];

describe("Mandantentrennung (Laufzeit, gemocktes Prisma)", () => {
  it.each(CASES)(
    "$name: Lookup mit userId, fremde Ressource -> 404 ohne Schreibzugriff",
    async (c) => {
      const body =
        c.method === "GET" || c.method === "DELETE"
          ? undefined
          : (c.body ?? { name: "x", notes: "x" });
      const res = await c.handler(req(c.method, body) as never, {
        params: Promise.resolve(c.params),
      });
      expect(res.status).toBe(404);
      expect(scopedToCaller(c.lookup)).toBe(true);
      const writes = [...mocks.fns.keys()].filter(
        (k) => WRITE_METHODS.includes(k.split(".")[1]) && wasCalled(k)
      );
      expect(writes).toEqual([]);
    }
  );

  it("nutrition-plan/[id] PATCH: Plan eines anderen Nutzers -> 404, kein update", async () => {
    mocks.fns.set(
      "nutritionPlan.findUnique",
      vi.fn(async () => ({ id: OTHER_ID, userId: "user-B" }))
    );
    const res = await nutritionPatch(req("PATCH", { notes: "x" }) as never, {
      params: Promise.resolve({ id: OTHER_ID }),
    });
    expect(res.status).toBe(404);
    expect(wasCalled("nutritionPlan.update")).toBe(false);
  });

  it("Gegenprobe tokens/[id] DELETE: eigener Token wird gelöscht (200), Lookup bleibt auf userId begrenzt", async () => {
    mocks.fns.set(
      "apiToken.findFirst",
      vi.fn(async () => ({ id: OTHER_ID }))
    );
    const res = await tokenDelete(req("DELETE") as never, {
      params: Promise.resolve({ id: OTHER_ID }),
    });
    expect(res.status).toBe(200);
    expect(scopedToCaller("apiToken.findFirst")).toBe(true);
    expect(fn("apiToken.delete")).toHaveBeenCalledWith({ where: { id: OTHER_ID } });
  });

  it("plan-sessions/[sessionId]/exercises POST: fremde/unsichtbare Übung -> 404, nichts angelegt (korrektes Vorbild)", async () => {
    mocks.fns.set(
      "planSession.findFirst",
      vi.fn(async () => ({ id: OTHER_ID }))
    );
    const res = await psAddExercise(req("POST", { exerciseId: EXERCISE_ID }) as never, {
      params: Promise.resolve({ sessionId: OTHER_ID }),
    });
    expect(res.status).toBe(404);
    expect(wasCalled("planSessionExercise.create")).toBe(false);
    expect(JSON.stringify(fn("exercise.findFirst").mock.calls[0][0].where)).toContain(
      `"userId":"${USER}"`
    );
  });

  // FT-SEC-12: heute wird die exerciseId nur als UUID geprüft; eine fremde Custom-Übung wird angehängt.
  it.fails(
    "FT-SEC-12: workouts/[id]/exercises POST lehnt eine für den Nutzer unsichtbare exerciseId mit 404 ab",
    async () => {
      mocks.fns.set(
        "workout.findFirst",
        vi.fn(async () => ({ id: OTHER_ID }))
      );
      mocks.fns.set(
        "workoutExercise.create",
        vi.fn(async () => ({ id: "we-1", exercise: { name: "Fremde Übung" }, sets: [] }))
      );
      const res = await workoutAddExercise(req("POST", { exerciseId: EXERCISE_ID }) as never, {
        params: Promise.resolve({ id: OTHER_ID }),
      });
      expect(res.status).toBe(404);
      expect(wasCalled("workoutExercise.create")).toBe(false);
    }
  );
});

/* ------------------------------ Quelltext-Scan ------------------------------ */

const ROOT = process.cwd();
const SCAN_DIRS = [join(ROOT, "src", "app", "api"), join(ROOT, "src", "services")];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__") continue;
      out.push(...walk(p));
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const rel = (p: string) => relative(ROOT, p).split(sep).join("/");

/** Inhalt aller `where: { … }`-Objekte (balancierte Klammern), die mit dem Schlüssel `id` beginnen. */
function idWhereClauses(src: string): string[] {
  const out: string[] = [];
  const re = /where:\s*\{/g;
  while (re.exec(src)) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < src.length && depth > 0) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    }
    const inner = src.slice(re.lastIndex, i - 1).trim();
    if (/^id\b/.test(inner)) out.push(inner);
  }
  return out;
}

/** `where` mit `id` ohne Mandantenbezug. `id: userId` (eigene User-Zeile) zählt als scoped. */
function bareIdClauses(src: string): string[] {
  return idWhereClauses(src).filter((c) => !/\buserId\b/.test(c));
}

const PRECHECK =
  "Vorab im selben Handler per findFirst/findUnique mit userId (bzw. plan./workout.-userId) geprüft; Zugriff danach nur per id.";

/**
 * Belegte Ausnahmen: "<Pfad relativ zum Repo>" -> Anzahl bare-`id`-Klauseln + Begründung.
 * Jede Stelle wurde im Quelltext gegengelesen (Check-then-act in derselben Funktion).
 */
const ALLOWLIST: Record<string, { count: number; reason: string }> = {
  "src/app/api/plan-session-exercises/[pseId]/route.ts": {
    count: 2,
    reason: `${PRECHECK} (getPseForUser: planSession.plan.userId)`,
  },
  "src/app/api/plans/[planId]/route.ts": {
    count: 2,
    reason: `${PRECHECK} (update/delete nach findFirst { id, userId })`,
  },
  "src/app/api/plans/[planId]/sessions/reorder/route.ts": {
    count: 1,
    reason: `${PRECHECK} (Plan mit userId, Sessions zusätzlich per planId begrenzt)`,
  },
  "src/app/api/exercises/[id]/route.ts": {
    count: 2,
    reason: `${PRECHECK} (findFirst { id, userId, isCustom: true })`,
  },
  "src/app/api/body-weight/[id]/route.ts": {
    count: 2,
    reason: `${PRECHECK} (findFirst { id, userId })`,
  },
  "src/app/api/nutrition-plan/route.ts": {
    count: 1,
    reason:
      "Update der aktiven Phase `existing.id`, die in derselben Transaktion per userId geladen wurde.",
  },
  "src/app/api/nutrition-plan/[id]/route.ts": {
    count: 2,
    reason: "findUnique per id, danach `existing.userId !== userId` -> 404; update erst danach.",
  },
  "src/app/api/plan-sessions/[sessionId]/exercises/reorder/route.ts": {
    count: 1,
    reason: `${PRECHECK} (Session mit plan.userId, Einträge zusätzlich per planSessionId begrenzt)`,
  },
  "src/app/api/plan-sessions/[sessionId]/route.ts": {
    count: 4,
    reason: `${PRECHECK} (getSessionForUser; Geschwister-Sessions stammen aus demselben, nutzereigenen Plan)`,
  },
  "src/app/api/workouts/route.ts": {
    count: 1,
    reason:
      "findUnique der planSessionId, Verknüpfung nur wenn `plan.userId === userId` (sonst null).",
  },
  "src/app/api/workouts/[id]/exercises/reorder/route.ts": {
    count: 1,
    reason: `${PRECHECK} (Workout mit userId, Einträge zusätzlich per workoutId begrenzt)`,
  },
  "src/app/api/workouts/[id]/exercises/[weId]/route.ts": {
    count: 4,
    reason: `${PRECHECK} (Workout mit userId, weId zusätzlich per workoutId begrenzt)`,
  },
  "src/app/api/workouts/[id]/exercises/[weId]/sets/route.ts": {
    count: 1,
    reason: `${PRECHECK} (Workout mit userId, weId zusätzlich per workoutId begrenzt)`,
  },
  "src/app/api/workouts/[id]/route.ts": {
    count: 2,
    reason: `${PRECHECK} (findFirst { id, userId })`,
  },
  "src/app/api/workouts/[id]/complete/route.ts": {
    count: 1,
    reason: `${PRECHECK} (findFirst { id, userId, completedAt: null })`,
  },
  "src/app/api/workouts/[id]/sets/[setId]/route.ts": {
    count: 3,
    reason: `${PRECHECK} (set.findFirst über workoutExercise.workout.userId)`,
  },
  "src/app/api/workouts/[id]/rest-timer-adjust/route.ts": {
    count: 1,
    reason: `${PRECHECK} (findFirst { id, userId })`,
  },
  "src/app/api/health/cardio/[id]/route.ts": {
    count: 1,
    reason: `${PRECHECK} (findFirst { id, userId })`,
  },
  "src/app/api/tokens/[id]/route.ts": {
    count: 1,
    reason: `${PRECHECK} (findFirst { id, userId })`,
  },
};

/**
 * Dateien, in denen `exerciseId` aus dem Request in ein `create` fließt, ohne dass die Sichtbarkeit
 * der Übung (`userId null` oder eigene) geprüft wird. Befund, noch nicht behoben.
 */
const EXERCISE_VISIBILITY_GAPS: Record<string, string> = {
  "src/app/api/workouts/[id]/exercises/route.ts":
    "FT-SEC-12: exerciseId nur als UUID validiert, keine Sichtbarkeitsprüfung vor workoutExercise.create.",
};

describe("Mandantentrennung (Quelltext-Scan)", () => {
  const files = SCAN_DIRS.flatMap(walk);

  it("scannt api und services (Plausibilität)", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => rel(f).startsWith("src/services/"))).toBe(true);
  });

  it("jede `where: { id … }`-Klausel ohne userId steht in der ALLOWLIST (exakte Anzahl)", () => {
    const found: Record<string, number> = {};
    for (const f of files) {
      const n = bareIdClauses(readFileSync(f, "utf8")).length;
      if (n > 0) found[rel(f)] = n;
    }
    const actual = Object.fromEntries(Object.entries(found).sort());
    const expected = Object.fromEntries(
      Object.entries(ALLOWLIST)
        .map(([k, v]) => [k, v.count] as const)
        .sort(([a], [b]) => a.localeCompare(b))
    );
    expect(actual).toEqual(expected);
  });

  it("Muster-Prüfung des Scanners: scoped, bare und eigene User-Zeile", () => {
    expect(bareIdClauses("prisma.a.findFirst({ where: { id, userId } })")).toEqual([]);
    expect(bareIdClauses("x({ where: { id, plan: { userId } } })")).toEqual([]);
    expect(bareIdClauses("x({ where: { id: userId } })")).toEqual([]);
    expect(bareIdClauses("x({ where: { id: pseId } })")).toEqual(["id: pseId"]);
    expect(
      bareIdClauses("x({ where: {\n  id,\n  OR: [{ userId: null }, { userId }],\n} })")
    ).toEqual([]);
  });

  it("exerciseId aus dem Request wird nur nach Sichtbarkeitsprüfung verwendet (Ausnahmen = Befunde)", () => {
    const gaps = files
      .filter((f) => rel(f).startsWith("src/app/api/"))
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        const usesBodyExercise = /exerciseId:\s*(parsed\.data|body(\.data)?)\.exerciseId/.test(src);
        const checksVisibility =
          /findExerciseVisibleToUser|OR:\s*\[\s*\{\s*userId\s*(:\s*null)?\s*\}/.test(src);
        return usesBodyExercise && !checksVisibility;
      })
      .map(rel)
      .sort();
    expect(gaps).toEqual(Object.keys(EXERCISE_VISIBILITY_GAPS).sort());
  });

  // Fund-Dokumentation (kein Fix in diesem Branch):
  it.todo(
    "FT-SEC-12: Sichtbarkeitsprüfung (findExerciseVisibleToUser) vor create in workouts/[id]/exercises, danach EXERCISE_VISIBILITY_GAPS leeren"
  );
  it.todo(
    "Härtung (kein eigenes Finding): update/delete per bare `id` nach separater Prüfung (Check-then-act, siehe ALLOWLIST) auf `updateMany/deleteMany` mit userId umstellen"
  );
});
