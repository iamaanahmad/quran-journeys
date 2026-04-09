import { fetchUserProgress, syncUserProgress } from "@/lib/user-progress";
import type { UserProgressSyncRequest } from "@/lib/types";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "qf-user";
  const cookieStore = await cookies();
  const accessToken =
    request.headers.get("x-auth-token") ?? cookieStore.get("qf_access_token")?.value;

  const response = await fetchUserProgress(userId, { accessToken });
  return NextResponse.json(response);
}

export async function POST(request: Request) {
  const body = (await request.json()) as UserProgressSyncRequest;

  if (!body?.userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const accessToken =
    request.headers.get("x-auth-token") ?? cookieStore.get("qf_access_token")?.value;
  const timezone = request.headers.get("x-timezone") ?? undefined;

  const response = await syncUserProgress(body, { accessToken, timezone });
  return NextResponse.json(response);
}
