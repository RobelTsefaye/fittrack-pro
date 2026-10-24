import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveUserId = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/api-auth", () => ({ resolveUserIdForDataApi: () => resolveUserId() }));

const { ApiError, requireUserId, withApi } = await import("@/lib/api/route-handler");
const { parseDateOnlyUtc } = await import("@/lib/date-only");

describe("withApi", () => {
  beforeEach(() => resolveUserId.mockReset());

  it("passes through successful responses and arguments", async () => {
    const handler = withApi(async (a: number, b: number) => Response.json({ sum: a + b }));
    const res = await handler(1, 2);
    expect(await res.json()).toEqual({ sum: 3 });
  });

  it("maps a missing user to 401", async () => {
    resolveUserId.mockResolvedValue(null);
    const res = await withApi(async () => {
      await requireUserId();
      return Response.json({});
    })();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("maps ApiError, malformed JSON and invalid dates to 4xx", async () => {
    const notFound = await withApi(async () => {
      throw new ApiError(404, "Workout not found");
    })();
    expect(notFound.status).toBe(404);

    const badJson = await withApi(async () => {
      await new Request("http://x", { method: "POST", body: "{nope" }).json();
      return Response.json({});
    })();
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toEqual({ error: "Invalid JSON body" });

    const badDate = await withApi(async () => {
      parseDateOnlyUtc("2024-02-30");
      return Response.json({});
    })();
    expect(badDate.status).toBe(400);
  });

  it("rethrows unexpected errors", async () => {
    await expect(
      withApi(async () => {
        throw new Error("boom");
      })()
    ).rejects.toThrow("boom");
  });

  it("returns the user id when authenticated", async () => {
    resolveUserId.mockResolvedValue("user_1");
    await expect(requireUserId()).resolves.toBe("user_1");
  });
});
