import { fetchTafsirBatch } from "@/lib/quran-foundation";
import type { VerseItem } from "@/lib/types";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as { verses?: VerseItem[]; tafsirId?: number };

  if (!body?.verses?.length) {
    return NextResponse.json(
      { error: "No verses supplied for tafsir" },
      { status: 400 },
    );
  }

  const tafsirId = body.tafsirId ?? 169; // Default: Ibn Kathir (English)
  const tafsirs = await fetchTafsirBatch(body.verses, tafsirId);

  return NextResponse.json({ tafsirs });
}
