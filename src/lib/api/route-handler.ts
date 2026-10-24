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

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** Session cookie or API bearer token → userId, else a 401 `ApiError`. */
export async function requireUserId(): Promise<string> {
  const userId = await resolveUserIdForDataApi();
  if (!userId) throw new ApiError(401, "Unauthorized");
  return userId;
}

/** `req.json()` that turns a malformed body into a 400 instead of a 500. */
export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
}

function toErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof ApiError) return jsonError(error.status, error.message);
  if (error instanceof InvalidDateError) {
    return jsonError(400, "Invalid date format; expected YYYY-MM-DD");
  }
  return null;
}

/**
 * Wraps a route handler so `ApiError`s (incl. `requireUserId` / `readJsonBody`)
 * and invalid `YYYY-MM-DD` dates become 4xx JSON responses. Anything else is rethrown unchanged (Next logs
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
