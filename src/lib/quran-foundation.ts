import type { VerseItem } from "@/lib/types";

// ---------------------------------------------------------------------------
// Quran Foundation Content API client
// Supports: Verses (uthmani + translation), Tafsir, Audio, Chapters
// Auth: OAuth2 Client Credentials with cached token
// ---------------------------------------------------------------------------

const QF_ENV = (process.env.QF_ENV ?? "prelive").trim();

const ENV_URLS: Record<string, { oauth: string; api: string }> = {
  production: {
    oauth: "https://oauth2.quran.foundation",
    api: "https://apis.quran.foundation",
  },
  prelive: {
    oauth: "https://prelive-oauth2.quran.foundation",
    api: "https://apis-prelive.quran.foundation",
  },
};

const FALLBACK_API = "https://api.quran.com";
const CLIENT_ID = (process.env.QF_CLIENT_ID ?? process.env.QURAN_CLIENT_ID ?? "").trim();
const CLIENT_SECRET = (process.env.QF_CLIENT_SECRET ?? process.env.QURAN_CLIENT_SECRET ?? "").trim();

// ---------------------------------------------------------------------------
// Token cache (server-side singleton)
// ---------------------------------------------------------------------------

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __qfContentToken: CachedToken | undefined;
}

async function getContentToken(): Promise<string | null> {
  if (!CLIENT_ID || !CLIENT_SECRET) return null;

  const cached = global.__qfContentToken;
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const urls = ENV_URLS[QF_ENV] ?? ENV_URLS.prelive;
  const tokenUrl = `${urls.oauth}/oauth2/token`;

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials&scope=content",
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    global.__qfContentToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    return data.access_token;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Authenticated Content API request helper
// ---------------------------------------------------------------------------

async function contentApiFetch(path: string): Promise<Response> {
  const token = await getContentToken();
  const urls = ENV_URLS[QF_ENV] ?? ENV_URLS.prelive;

  if (token) {
    const authenticatedUrl = `${urls.api}/content/api/v4${path}`;
    const response = await fetch(authenticatedUrl, {
      headers: {
        Accept: "application/json",
        "x-auth-token": token,
        "x-client-id": CLIENT_ID,
      },
      next: { revalidate: 3600 },
    });

    if (response.ok) return response;

    // On 401, clear token and retry once
    if (response.status === 401) {
      global.__qfContentToken = undefined;
      const retryToken = await getContentToken();
      if (retryToken) {
        return fetch(authenticatedUrl, {
          headers: {
            Accept: "application/json",
            "x-auth-token": retryToken,
            "x-client-id": CLIENT_ID,
          },
          next: { revalidate: 3600 },
        });
      }
    }
  }

  // Fallback to public API (no auth)
  return fetch(`${FALLBACK_API}/api/v4${path}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
  });
}

// ---------------------------------------------------------------------------
// Audio URL builder
// ---------------------------------------------------------------------------

function buildAudioUrl(verseKey: string): string {
  const [surahStr, ayahStr] = verseKey.split(":");
  const surah = surahStr.padStart(3, "0");
  const ayah = ayahStr.padStart(3, "0");
  return `https://verses.quran.com/Alafasy/mp3/${surah}${ayah}.mp3`;
}

// ---------------------------------------------------------------------------
// Translation ID resolver
// ---------------------------------------------------------------------------

const TRANSLATION_IDS: Record<string, number> = {
  english: 85,   // M.A.S. Abdel Haleem
  urdu: 54,      // Fateh Muhammad Jalandhry
  spanish: 83,   // Julio Cortes
  french: 31,    // Muhammad Hamidullah
  turkish: 77,   // Diyanet Isleri
  indonesian: 33, // Indonesian Ministry of Religious Affairs
  bangla: 161,   // Muhiuddin Khan
};

export function getTranslationId(language: string): number {
  const norm = language.toLowerCase().trim();
  for (const [key, id] of Object.entries(TRANSLATION_IDS)) {
    if (norm.includes(key)) return id;
  }
  return 85;
}

// ---------------------------------------------------------------------------
// Chapter metadata
// ---------------------------------------------------------------------------

export interface ChapterInfo {
  id: number;
  nameSimple: string;
  nameArabic: string;
  versesCount: number;
  translatedName: string;
}

export async function fetchAllChapters(): Promise<ChapterInfo[]> {
  try {
    const response = await contentApiFetch("/chapters?language=en");
    if (!response.ok) return [];

    const data = (await response.json()) as {
      chapters: Array<{
        id: number;
        name_simple: string;
        name_arabic: string;
        verses_count: number;
        translated_name: { name: string };
      }>;
    };

    return data.chapters.map((ch) => ({
      id: ch.id,
      nameSimple: ch.name_simple,
      nameArabic: ch.name_arabic,
      versesCount: ch.verses_count,
      translatedName: ch.translated_name.name,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Verse fetching — by chapter (with pagination support)
// ---------------------------------------------------------------------------

interface UthmaniPayload {
  verses?: Array<{
    verse_key: string;
    text_uthmani: string;
  }>;
}

interface TranslationPayload {
  translations?: Array<{
    verse_key?: string;
    resource_id?: number;
    text: string;
  }>;
}

export async function fetchVersesByChapter(
  chapterNumber: number,
  limit = 50,
  translationId = 85,
): Promise<VerseItem[]> {
  try {
    const [uthmaniResp, translationResp] = await Promise.all([
      contentApiFetch(`/quran/verses/uthmani?chapter_number=${chapterNumber}`),
      contentApiFetch(`/quran/translations/${translationId}?chapter_number=${chapterNumber}`),
    ]);

    if (!uthmaniResp.ok || !translationResp.ok) return [];

    const uthmani = (await uthmaniResp.json()) as UthmaniPayload;
    const translations = (await translationResp.json()) as TranslationPayload;

    if (!uthmani.verses?.length || !translations.translations?.length) return [];

    const verses: VerseItem[] = uthmani.verses.slice(0, limit).map((item, index) => {
      const [surah, ayah] = item.verse_key.split(":").map(Number);
      const rawText = translations.translations?.[index]?.text ?? "";
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

    return verses.filter((v) => v.translation.length > 0);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Verse fetching — by juz
// ---------------------------------------------------------------------------

export async function fetchVersesByJuz(
  juzNumber: number,
  limit = 50,
  translationId = 85,
): Promise<VerseItem[]> {
  try {
    const response = await contentApiFetch(
      `/verses/by_juz/${juzNumber}?language=en&translations=${translationId}&fields=text_uthmani,chapter_id,verse_number&per_page=${limit}`,
    );

    if (!response.ok) return [];

    const data = (await response.json()) as {
      verses: Array<{
        verse_key: string;
        text_uthmani: string;
        translations: Array<{ text: string }>;
      }>;
    };

    return (data.verses ?? []).map((v) => {
      const [surah, ayah] = v.verse_key.split(":").map(Number);
      const rawText = v.translations?.[0]?.text ?? "";
      const cleanText = rawText.replace(/<[^>]*>/g, "");

      return {
        key: v.verse_key,
        surah,
        ayah,
        arabic: v.text_uthmani,
        translation: cleanText,
        audioUrl: buildAudioUrl(v.verse_key),
      };
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Tafsir fetching
// ---------------------------------------------------------------------------

export interface TafsirItem {
  verseKey: string;
  text: string;
  resourceName: string;
}

export async function fetchTafsir(
  chapterNumber: number,
  verseNumber: number,
  tafsirId = 169, // Default: Ibn Kathir (English)
): Promise<TafsirItem | null> {
  try {
    const response = await contentApiFetch(
      `/tafsirs/${tafsirId}/by_ayah/${chapterNumber}:${verseNumber}`,
    );

    if (!response.ok) return null;

    const data = (await response.json()) as {
      tafsir: {
        verse_key: string;
        text: string;
        resource_name: string;
      };
    };

    if (!data.tafsir) return null;

    return {
      verseKey: data.tafsir.verse_key,
      text: data.tafsir.text.replace(/<[^>]*>/g, ""),
      resourceName: data.tafsir.resource_name,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Batch tafsir for a range of verses (limited to first 3 for performance)
// ---------------------------------------------------------------------------

export async function fetchTafsirBatch(
  verses: VerseItem[],
  tafsirId = 169,
): Promise<TafsirItem[]> {
  const limited = verses.slice(0, 3);
  const results = await Promise.allSettled(
    limited.map((v) => fetchTafsir(v.surah, v.ayah, tafsirId)),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<TafsirItem | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((item): item is TafsirItem => item !== null);
}

// ---------------------------------------------------------------------------
// Backward-compatible alias
// ---------------------------------------------------------------------------

export const fetchQuranFoundationVerses = fetchVersesByChapter;
