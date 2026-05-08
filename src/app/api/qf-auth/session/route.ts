import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf("=");
        return [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
      }),
  );

  const accessToken = cookies.qf_access_token;
  const refreshToken = cookies.qf_refresh_token;
  const expiresAtRaw = cookies.qf_token_expires_at;
  const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : null;

  // Determine if token is near expiry (within 2 minutes)
  const now = Date.now();
  const isNearExpiry = expiresAt ? expiresAt - now < 2 * 60 * 1000 : false;
  const isExpired = expiresAt ? expiresAt <= now : !accessToken;

  return NextResponse.json({
    connected: Boolean(accessToken),
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
    hasRefreshToken: Boolean(refreshToken),
    isNearExpiry,
    isExpired: isExpired && !accessToken,
    needsRefresh: Boolean(refreshToken && (isNearExpiry || !accessToken)),
  });
}
