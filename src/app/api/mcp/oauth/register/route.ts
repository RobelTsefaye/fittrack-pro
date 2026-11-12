import { NextRequest, NextResponse } from "next/server";
import { signOAuthClientId } from "@/lib/oauth-crypto";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Erlaubt: https, oder http nur auf Loopback (native Clients); keine Fragmente/Userinfo. */
function isAllowedRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

/**
 * Dynamic Client Registration (RFC 7591), zustandslos: die client_id ist signiert und enthält
 * die registrierten redirect_uris (siehe oauth-crypto.ts). authorize und token prüfen exakt dagegen.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // ignore
  }

  const uris = body.redirect_uris;
  if (
    !Array.isArray(uris) ||
    uris.length === 0 ||
    uris.length > 10 ||
    !uris.every(isAllowedRedirectUri)
  ) {
    return NextResponse.json(
      {
        error: "invalid_redirect_uri",
        error_description:
          "redirect_uris: 1-10 absolute https- (oder Loopback-http-) URIs ohne Fragment",
      },
      { status: 400, headers: CORS }
    );
  }

  const clientId = signOAuthClientId(uris);
  const now = Math.floor(Date.now() / 1000);

  return NextResponse.json(
    {
      client_id: clientId,
      client_id_issued_at: now,
      redirect_uris: uris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      client_name: body.client_name ?? "MCP Client",
    },
    { status: 201, headers: CORS }
  );
}
