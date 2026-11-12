import { vi } from "vitest";

/**
 * Gemocktes Prisma für Contract-Tests der Routen (kein DB-Zugriff).
 * Jede Methode ist ein `vi.fn` mit leerem Standardwert (`findMany` → `[]`,
 * `findFirst`/`findUnique` → `null`, `count` → 0, `$queryRaw` → `[]`);
 * `set("workout.findMany", impl)` überschreibt ihn je Test.
 */
const DEFAULTS: Record<string, unknown> = {
  findMany: [],
  groupBy: [],
  count: 0,
  findFirst: null,
  findUnique: null,
  upsert: null,
};

export function createPrismaMock() {
  const fns = new Map<string, ReturnType<typeof vi.fn>>();
  const get = (key: string) => {
    let fn = fns.get(key);
    if (!fn) {
      const method = key.split(".").pop()!;
      fn = vi.fn(async () => (method in DEFAULTS ? DEFAULTS[method] : null));
      if (key.startsWith("$")) fn = vi.fn(async () => []);
      fns.set(key, fn);
    }
    return fn;
  };
  const prisma = new Proxy({} as Record<string, unknown>, {
    get(_t, name: string) {
      if (name.startsWith("$")) return get(name);
      return new Proxy({}, { get: (_m, method: string) => get(`${name}.${method}`) });
    },
  });
  return {
    prisma,
    set(key: string, impl: (...args: never[]) => unknown) {
      get(key).mockImplementation(async (...a: unknown[]) => (impl as (...x: unknown[]) => unknown)(...a));
    },
    reset() {
      for (const fn of fns.values()) fn.mockReset();
      fns.clear();
    },
    calls: (key: string) => get(key).mock.calls,
  };
}
