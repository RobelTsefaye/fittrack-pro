import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  generateApiTokenSecret,
  hashApiTokenSecret,
  apiTokenPrefixLabel,
} from "@/lib/api-token-crypto";
import { encryptOAuthCode, verifyOAuthClientId } from "@/lib/oauth-crypto";

/**
 * OAuth 2.0 Authorization Endpoint.
 * Claude.ai redirects the user's browser here. We check the FitTrack session,
 * mint a throwaway API token, encrypt it into a short-lived auth code, and
 * redirect back to the redirect_uri bound in the signed client_id (exact match, PKCE S256 required).
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const redirectUri = params.get("redirect_uri");
  const state = params.get("state") ?? "";
  const responseType = params.get("response_type") ?? "code";
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");
  const clientId = params.get("client_id") ?? "";

  // Client und redirect_uri zuerst prüfen: bei Fehlern NIE weiterleiten (kein offener Redirect).
  const client = verifyOAuthClientId(clientId);
  if (!client) {
    return badRequest(
      "invalid_client",
      "client_id ungültig (zuerst /api/mcp/oauth/register aufrufen)"
    );
  }
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return badRequest("invalid_request", "redirect_uri nicht für diesen Client registriert");
  }
  if (responseType !== "code") {
    return errorRedirect(redirectUri, "unsupported_response_type", state);
  }
  // PKCE ist Pflicht, nur S256.
  if (
    codeChallengeMethod !== "S256" ||
    !codeChallenge ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)
  ) {
    return badRequest(
      "invalid_request",
      "PKCE erforderlich: code_challenge (S256) und code_challenge_method=S256"
    );
  }

  // Require a logged-in FitTrack session. If missing, bounce to /login with
  // callbackUrl pointing back here so we can resume after sign-in.
  const session = await auth();
  if (!session?.user?.id) {
    const current = req.nextUrl.pathname + req.nextUrl.search;
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", current);
    return NextResponse.redirect(loginUrl);
  }

  // Mint a fresh API token for this connector instance.
  const secret = generateApiTokenSecret();
  const tokenHash = hashApiTokenSecret(secret);
  const tokenPrefix = apiTokenPrefixLabel(secret);
  await prisma.apiToken.create({
    data: {
      userId: session.user.id,
      name: `Claude MCP (${new Date().toISOString().slice(0, 10)})`,
      tokenHash,
      tokenPrefix,
    },
  });

  // Build an encrypted code containing the secret + PKCE challenge.
  const code = encryptOAuthCode({
    s: secret,
    cc: codeChallenge,
    ccm: codeChallengeMethod,
    ru: redirectUri,
    ci: clientId,
    exp: Date.now() + 5 * 60 * 1000, // 5-minute TTL
  });

  const back = new URL(redirectUri);
  back.searchParams.set("code", code);
  if (state) back.searchParams.set("state", state);
  return NextResponse.redirect(back);
}

function badRequest(error: string, description: string) {
  return NextResponse.json({ error, error_description: description }, { status: 400 });
}

/** Nur mit bereits gegen den Client geprüfter redirect_uri aufrufen. */
function errorRedirect(redirectUri: string, error: string, state: string) {
  try {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    if (state) url.searchParams.set("state", state);
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.json({ error }, { status: 400 });
  }
}
