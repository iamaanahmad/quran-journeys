import {
  generatePkceChallenge,
  generatePkceVerifier,
  generateStateToken,
  getQfOidcConfig,
} from "@/lib/qf-oidc";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const COOKIE_MAX_AGE = 60 * 10;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.QF_OAUTH_REDIRECT_URI?.replace(/\/api\/qf-auth\/callback$/, "") || url.origin).replace(/\/$/, "");
  const nextPath = url.searchParams.get("next") || "/app";

  const config = getQfOidcConfig(appUrl);
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
  
  const isSecure = appUrl.startsWith("https");
  
  response.cookies.set({
    name: "qf_oauth_state",
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  response.cookies.set({
    name: "qf_pkce_verifier",
    value: verifier,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  response.cookies.set({
    name: "qf_oauth_next",
    value: nextPath,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  return response;
}
