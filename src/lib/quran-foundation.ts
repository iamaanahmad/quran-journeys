import type { VerseItem } from "@/lib/types";

interface UthmaniPayload {
  verses?: Array<{
    verse_key: string;
    text_uthmani: string;
  }>;
}

interface TranslationPayload {
  translations?: Array<{
    verse_key: string;
    text: string;
  }>;
}

function buildAudioUrl(verseKey: string): string {
  const [surahStr, ayahStr] = verseKey.split(":");
  const surah = surahStr.padStart(3, "0");
  const ayah = ayahStr.padStart(3, "0");
  return `https://verses.quran.com/Alafasy/mp3/${surah}${ayah}.mp3`;
}

export async function fetchQuranFoundationVerses(
  chapterNumber = 2,
  limit = 42,
  translationId = 85 // Default: 85 (Abdul Haleem). 54 (Urdu Junagarhi), 83 (Spanish), 31 (French).
): Promise<VerseItem[]> {
  try {
    const [uthmaniResponse, translationResponse] = await Promise.all([
      fetch(
        `https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=${chapterNumber}`,
        {
          next: { revalidate: 3600 },
          headers: { Accept: "application/json" },
        },
      ),
      fetch(
        `https://api.quran.com/api/v4/quran/translations/${translationId}?chapter_number=${chapterNumber}`,
        {
          next: { revalidate: 3600 },
          headers: { Accept: "application/json" },
        },
      ),
    ]);

    if (!uthmaniResponse.ok || !translationResponse.ok) {
      return [];
    }

    const uthmani = (await uthmaniResponse.json()) as UthmaniPayload;
    const translations = (await translationResponse.json()) as TranslationPayload;

    if (!uthmani.verses?.length || !translations.translations?.length) {
      return [];
    }

    const verses: VerseItem[] = uthmani.verses.slice(0, limit).map((item, index) => {
      const [surah, ayah] = item.verse_key.split(":").map(Number);
      // Strip HTML tags like <sup> for pure text
      const rawText = translations.translations?.[index]?.text || "";
      const cleanText = rawText.replace(/<[^>]*>/g, "");

      return {
        key: item.verse_key,
        surah,
        ayah,
        arabic: item.text_uthmani,
        translation: cleanText,
        audioUrl: buildAudioUrl(item.verse_key),
      };
    });

    return verses.filter((item) => item.translation.length > 0);
  } catch {
    return [];
  }
}
