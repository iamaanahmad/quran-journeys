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
  const expiresAtRaw = cookies.qf_token_expires_at;
  const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : null;

  return NextResponse.json({
    connected: Boolean(accessToken),
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
  });
}
