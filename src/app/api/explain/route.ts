import { generateExplanation } from "@/lib/explain";
import type { VerseItem } from "@/lib/types";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as { verses?: VerseItem[] };

  if (!body?.verses?.length) {
    return NextResponse.json(
      { error: "No verses supplied for explanation" },
      { status: 400 },
    );
  }

  const explanation = await generateExplanation(body.verses);
  return NextResponse.json(explanation);
}
