import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// QF Reflections (Posts) API — /auth/v1/posts
// Posts a user reflection to Quran Foundation ecosystem
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

// POST /api/reflections — Post a reflection
export async function POST(request: Request) {
  const token = await getAccessToken(request);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Not connected to Quran account" },
      { status: 401 },
    );
  }

  const body = (await request.json()) as {
    body?: string;
    verseKey?: string;  // e.g. "2:255"
    chapterNumber?: number;
    verseNumber?: number;
  };

  if (!body?.body?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Reflection text is required" },
      { status: 400 },
    );
  }

  const url = `${getBaseUrl()}/v1/posts`;

  // Build the payload — align with QF Post API structure
  const postPayload: Record<string, unknown> = {
    body: body.body.trim(),
  };

  // Attach verse reference if available
  if (body.verseKey) {
    const [surah, ayah] = body.verseKey.split(":").map(Number);
    postPayload.chapterNumber = surah;
    postPayload.verseNumber = ayah;
  } else {
    if (body.chapterNumber) postPayload.chapterNumber = body.chapterNumber;
    if (body.verseNumber) postPayload.verseNumber = body.verseNumber;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: buildHeaders(token),
      body: JSON.stringify(postPayload),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { ok: false, error: `QF API ${response.status}: ${text.slice(0, 200)}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json({ ok: true, post: data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to post reflection",
      },
      { status: 500 },
    );
  }
}
