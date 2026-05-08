import { getQfOidcConfig } from "@/lib/qf-oidc";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * POST /api/qf-auth/refresh
 * Uses the stored refresh_token to obtain a new access_token.
 * Solves the 10-minute session expiry issue.
 */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("qf_refresh_token")?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { ok: false, error: "no_refresh_token" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.QF_OAUTH_REDIRECT_URI?.replace(/\/api\/qf-auth\/callback$/, "") ||
    url.origin
  ).replace(/\/$/, "");

  const config = getQfOidcConfig(appUrl);
  const tokenUrl = `${config.oauthBaseUrl}/oauth2/token`;

  try {
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        ...(config.clientSecret
          ? {
              Authorization: `Basic ${Buffer.from(
                `${config.clientId}:${config.clientSecret}`,
              ).toString("base64")}`,
            }
          : {}),
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: config.clientId,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      return NextResponse.json(
        {
          ok: false,
          error: `refresh_failed_${tokenResponse.status}`,
          details: errText.slice(0, 200),
        },
        { status: 401 },
      );
    }

    const payload = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      id_token?: string;
    };

    if (!payload.access_token) {
      return NextResponse.json(
        { ok: false, error: "no_access_token_in_response" },
        { status: 500 },
      );
    }

    const response = NextResponse.json({
      ok: true,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    });

    const expiresIn = Math.max(300, payload.expires_in ?? 3600);
    const secure = appUrl.startsWith("https");

    response.cookies.set({
      name: "qf_access_token",
      value: payload.access_token,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: expiresIn,
    });

    // Update refresh token if a new one was issued
    if (payload.refresh_token) {
      response.cookies.set({
        name: "qf_refresh_token",
        value: payload.refresh_token,
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    if (payload.id_token) {
      response.cookies.set({
        name: "qf_id_token",
        value: payload.id_token,
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: expiresIn,
      });
    }

    response.cookies.set({
      name: "qf_token_expires_at",
      value: String(Date.now() + expiresIn * 1000),
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: expiresIn,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "refresh_exception",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
