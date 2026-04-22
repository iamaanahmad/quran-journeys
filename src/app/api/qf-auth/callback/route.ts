import { getQfOidcConfig } from "@/lib/qf-oidc";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const DAY = 60 * 60 * 24;

function toErrorRedirect(origin: string, nextPath: string, message: string) {
  const target = new URL(nextPath || "/app", origin);
  target.searchParams.set("qf", "error");
  target.searchParams.set("message", message);
  return target;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.QF_OAUTH_REDIRECT_URI?.replace(/\/api\/qf-auth\/callback$/, "") || url.origin).replace(/\/$/, "");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const qf_oauth_state = cookieStore.get("qf_oauth_state")?.value;
  const qf_pkce_verifier = cookieStore.get("qf_pkce_verifier")?.value;
  const qf_oauth_next = cookieStore.get("qf_oauth_next")?.value;

  const nextPath = qf_oauth_next || "/app";

  if (oauthError) {
    return NextResponse.redirect(
      toErrorRedirect(appUrl, nextPath, `oauth_${oauthError}`).toString(),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      toErrorRedirect(appUrl, nextPath, "missing_code_or_state").toString(),
    );
  }

  if (!qf_oauth_state || qf_oauth_state !== state) {
    return NextResponse.redirect(
      toErrorRedirect(appUrl, nextPath, "invalid_state").toString(),
    );
  }

  if (!qf_pkce_verifier) {
    return NextResponse.redirect(
      toErrorRedirect(appUrl, nextPath, "missing_pkce_verifier").toString(),
    );
  }

  const config = getQfOidcConfig(appUrl);
  const tokenUrl = `${config.oauthBaseUrl}/oauth2/token`;

  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      code_verifier: qf_pkce_verifier,
      ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    return NextResponse.redirect(
      toErrorRedirect(appUrl, nextPath, `token_exchange_failed_${tokenResponse.status}:${errText.slice(0, 80)}`).toString(),
    );
  }

  const payload = (await tokenResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
  };

  if (!payload.access_token) {
    return NextResponse.redirect(
      toErrorRedirect(appUrl, nextPath, "missing_access_token").toString(),
    );
  }

  const target = new URL(nextPath, appUrl);
  target.searchParams.set("qf", "connected");

  const response = NextResponse.redirect(target.toString());
  const expiresIn = Math.max(300, payload.expires_in ?? 3600);
  const secure = appUrl.startsWith("https");

  cookieStore.set("qf_access_token", payload.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: expiresIn,
  });

  if (payload.refresh_token) {
    cookieStore.set("qf_refresh_token", payload.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: DAY * 30,
    });
  }

  if (payload.id_token) {
    cookieStore.set("qf_id_token", payload.id_token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: expiresIn,
    });
  }

  cookieStore.set("qf_token_expires_at", String(Date.now() + expiresIn * 1000), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: expiresIn,
  });

  cookieStore.delete("qf_oauth_state");
  cookieStore.delete("qf_pkce_verifier");
  cookieStore.delete("qf_oauth_next");

  return response;
}
