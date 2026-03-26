import { fetchUserProgress, syncUserProgress } from "@/lib/user-progress";
import type { UserProgressSyncRequest } from "@/lib/types";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const response = await fetchUserProgress(userId);
  return NextResponse.json(response);
}

export async function POST(request: Request) {
  const body = (await request.json()) as UserProgressSyncRequest;

  if (!body?.userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const response = await syncUserProgress(body);
  return NextResponse.json(response);
}
