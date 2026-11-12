import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-auth", () => ({ resolveUserIdForDataApi: async () => null }));

const { ApiError, requireUserId, withApi } = await import("@/lib/api/route-handler");
const { InvalidDateError } = await import("@/lib/date-only");

/** Ergänzt route-handler.test.ts um Fehlerabbildung im Detail (Characterization). */
describe("withApi: Fehlerabbildung", () => {
  it("401 ohne Session: JSON-Body {error:'Unauthorized'} und kein Aufruf des restlichen Handlers", async () => {
    const after = vi.fn();
    const res = await withApi(async () => {
      await requireUserId();
      after();
      return Response.json({});
    })();
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(after).not.toHaveBeenCalled();
  });

  it.each([400, 403, 404, 409, 422])(
    "ApiError(%i) wird 1:1 als Status mit Meldung ausgegeben",
    async (status) => {
      const res = await withApi(async () => {
        throw new ApiError(status, "msg");
      })();
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error: "msg" });
    }
  );

  it("InvalidDateError: feste 400-Meldung, Eingabewert wird nicht gespiegelt", async () => {
    const res = await withApi(async () => {
      throw new InvalidDateError("<script>");
    })();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid date format; expected YYYY-MM-DD" });
  });

  it("ApiError ist ein Error mit Name und Status", () => {
    const e = new ApiError(418, "teapot");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("ApiError");
    expect(e.status).toBe(418);
  });

  it("IST: ApiError mit 5xx wird nicht rethrown, sondern als JSON-Antwort ausgegeben", async () => {
    const res = await withApi(async () => {
      throw new ApiError(503, "down");
    })();
    expect(res.status).toBe(503);
  });

  it("rethrowt Nicht-Error-Werte unverändert (z. B. Strings)", async () => {
    await expect(
      withApi(async () => {
        throw "plain string";
      })()
    ).rejects.toBe("plain string");
  });

  it("fängt auch Fehler aus asynchronen Handlern nach einem await", async () => {
    const res = await withApi(async () => {
      await Promise.resolve();
      throw new ApiError(404, "later");
    })();
    expect(res.status).toBe(404);
  });
});
