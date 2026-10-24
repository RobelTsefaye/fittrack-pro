import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { InvalidDateError } from "@/lib/date-only";

/** Throw from inside a `withApi` handler to short-circuit with a JSON error. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** Session cookie or API bearer token → userId, else a 401 `ApiError`. */
export async function requireUserId(): Promise<string> {
  const userId = await resolveUserIdForDataApi();
  if (!userId) throw new ApiError(401, "Unauthorized");
  return userId;
}

function toErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof ApiError) return jsonError(error.status, error.message);
  if (error instanceof InvalidDateError) {
    return jsonError(400, "Invalid date format; expected YYYY-MM-DD");
  }
  // `await req.json()` on a malformed body — a client error, not a 500.
  if (error instanceof SyntaxError && /JSON/i.test(error.message)) {
    return jsonError(400, "Invalid JSON body");
  }
  return null;
}

/**
 * Wraps a route handler so `ApiError`s, bad JSON bodies and invalid dates
 * become 4xx JSON responses. Anything else is rethrown unchanged (Next logs
 * it and responds 500, as before).
 */
export function withApi<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      const response = toErrorResponse(error);
      if (response) return response;
      throw error;
    }
  };
}
