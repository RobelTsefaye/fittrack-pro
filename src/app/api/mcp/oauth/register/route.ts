import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * Dynamic Client Registration (RFC 7591) — minimal stub.
 * We don't actually track clients; we return a random client_id and trust
 * the authorization_code flow to validate the request.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // ignore
  }

  const clientId = `mcp_${randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);

  return NextResponse.json(
    {
      client_id: clientId,
      client_id_issued_at: now,
      redirect_uris: body.redirect_uris ?? [],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      client_name: body.client_name ?? "MCP Client",
    },
    { status: 201, headers: CORS }
  );
}
