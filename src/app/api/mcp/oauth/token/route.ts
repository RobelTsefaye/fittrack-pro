import { NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { decryptOAuthCode } from "@/lib/oauth-crypto";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * OAuth 2.0 Token Endpoint — exchanges the authorization code for an access
 * token. The "access token" we return is simply the FitTrack API token secret
 * that was encrypted into the code during the authorize step.
 */
export async function POST(req: NextRequest) {
  const form = await parseBody(req);
  const grantType = form.get("grant_type");
  const code = form.get("code");
  const codeVerifier = form.get("code_verifier");
  const redirectUri = form.get("redirect_uri");
  const clientId = form.get("client_id");

  if (grantType !== "authorization_code") {
    return json({ error: "unsupported_grant_type" }, 400);
  }
  if (!code) {
    return json({ error: "invalid_request", error_description: "code required" }, 400);
  }

  const payload = decryptOAuthCode(code);
  if (!payload) {
    return json({ error: "invalid_grant", error_description: "bad code" }, 400);
  }

  const exp = Number(payload.exp ?? 0);
  if (!exp || exp < Date.now()) {
    return json({ error: "invalid_grant", error_description: "code expired" }, 400);
  }

  // redirect_uri (und client_id, falls gesendet) müssen exakt dem authorize-Request entsprechen.
  if (!redirectUri || redirectUri !== payload.ru) {
    return json({ error: "invalid_grant", error_description: "redirect_uri mismatch" }, 400);
  }
  if (clientId && clientId !== payload.ci) {
    return json({ error: "invalid_grant", error_description: "client_id mismatch" }, 400);
  }

  // PKCE ist Pflicht (nur S256).
  const cc = payload.cc as string | null | undefined;
  if (!cc || payload.ccm !== "S256") {
    return json({ error: "invalid_grant", error_description: "PKCE S256 required" }, 400);
  }
  if (!codeVerifier || !/^[A-Za-z0-9\-._~]{43,128}$/.test(codeVerifier)) {
    return json({ error: "invalid_request", error_description: "code_verifier required" }, 400);
  }
  const computed = Buffer.from(createHash("sha256").update(codeVerifier).digest("base64url"));
  const expected = Buffer.from(cc);
  if (computed.length !== expected.length || !timingSafeEqual(computed, expected)) {
    return json({ error: "invalid_grant", error_description: "PKCE mismatch" }, 400);
  }

  const secret = payload.s as string | undefined;
  if (!secret) {
    return json({ error: "invalid_grant" }, 400);
  }

  return json(
    {
      access_token: secret,
      token_type: "Bearer",
      scope: "mcp",
      // No expiry — the underlying API token lives until revoked in Settings.
    },
    200
  );
}

async function parseBody(req: NextRequest): Promise<URLSearchParams> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (v != null) params.set(k, String(v));
    }
    return params;
  }
  const text = await req.text();
  return new URLSearchParams(text);
}

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...CORS,
    },
  });
}
