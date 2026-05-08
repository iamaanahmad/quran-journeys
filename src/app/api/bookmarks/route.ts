import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// QF Bookmarks API — /auth/v1/bookmarks
// Requires OAuth user access token (from QF OIDC connect)
// ---------------------------------------------------------------------------

const quranEnv = (process.env.QF_ENV ?? process.env.NEXT_PUBLIC_QF_ENV ?? "prelive").trim();
const qfClientId = (process.env.QF_CLIENT_ID ?? process.env.QURAN_CLIENT_ID ?? "").trim();

const defaultBaseByEnv: Record<string, string> = {
  production: "https://apis.quran.foundation/auth",
  prelive: "https://apis-prelive.quran.foundation/auth",
};

function getBaseUrl(): string {
  const base = (process.env.QF_USER_API_BASE_URL ?? "").trim() ||
    defaultBaseByEnv[quranEnv] || defaultBaseByEnv.prelive;
  const trimmed = base.replace(/\/$/, "");
  return trimmed.endsWith("/auth") ? trimmed : `${trimmed}/auth`;
}

async function getAccessToken(request: Request): Promise<string | null> {
  const cookieStore = await cookies();
  return (
    request.headers.get("x-auth-token") ??
    cookieStore.get("qf_access_token")?.value ??
    null
  );
}

function buildHeaders(token: string): Headers {
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-auth-token": token,
  });
  if (qfClientId) headers.set("x-client-id", qfClientId);
  return headers;
}

// GET /api/bookmarks — List user bookmarks
export async function GET(request: Request) {
  const token = await getAccessToken(request);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Not connected to Quran account", bookmarks: [] },
      { status: 401 },
    );
  }

  const url = `${getBaseUrl()}/v1/bookmarks`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: buildHeaders(token),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { ok: false, error: `QF API ${response.status}: ${text.slice(0, 200)}`, bookmarks: [] },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json({ ok: true, bookmarks: data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to fetch bookmarks",
        bookmarks: [],
      },
      { status: 500 },
    );
  }
}

// POST /api/bookmarks — Add a bookmark
export async function POST(request: Request) {
  const token = await getAccessToken(request);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Not connected to Quran account" },
      { status: 401 },
    );
  }

  const body = (await request.json()) as {
    key?: string; // e.g. "2:255"
    mushafId?: number;
    type?: string;
  };

  if (!body?.key) {
    return NextResponse.json(
      { ok: false, error: "Missing verse key" },
      { status: 400 },
    );
  }

  const url = `${getBaseUrl()}/v1/bookmarks`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: buildHeaders(token),
      body: JSON.stringify({
        key: body.key,
        mushafId: body.mushafId ?? 2,
        type: body.type ?? "ayah",
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { ok: false, error: `QF API ${response.status}: ${text.slice(0, 200)}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json({ ok: true, bookmark: data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to create bookmark",
      },
      { status: 500 },
    );
  }
}

// DELETE /api/bookmarks?key=2:255 — Remove a bookmark
export async function DELETE(request: Request) {
  const token = await getAccessToken(request);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Not connected to Quran account" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json(
      { ok: false, error: "Missing verse key" },
      { status: 400 },
    );
  }

  const url = `${getBaseUrl()}/v1/bookmarks/${encodeURIComponent(key)}`;

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: buildHeaders(token),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { ok: false, error: `QF API ${response.status}: ${text.slice(0, 200)}` },
        { status: response.status },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to delete bookmark",
      },
      { status: 500 },
    );
  }
}
