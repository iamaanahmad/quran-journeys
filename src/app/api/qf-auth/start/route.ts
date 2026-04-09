import {
  generatePkceChallenge,
  generatePkceVerifier,
  generateStateToken,
  getQfOidcConfig,
} from "@/lib/qf-oidc";
import { NextResponse } from "next/server";

const COOKIE_MAX_AGE = 60 * 10;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const nextPath = url.searchParams.get("next") || "/app";

  const config = getQfOidcConfig();
  const verifier = generatePkceVerifier();
  const challenge = generatePkceChallenge(verifier);
  const state = generateStateToken();

  const authUrl = new URL(`${config.oauthBaseUrl}/oauth2/auth`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", config.redirectUri);
  authUrl.searchParams.set("scope", config.scope);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authUrl.toString());
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set("qf_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  response.cookies.set("qf_pkce_verifier", verifier, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  response.cookies.set("qf_oauth_next", nextPath, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  return response;
}
