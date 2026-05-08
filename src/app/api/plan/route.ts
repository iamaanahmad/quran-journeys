import { DEMO_VERSES } from "@/lib/demo-content";
import { buildSevenDayPlan } from "@/lib/planner";
import {
  fetchVersesByChapter,
  fetchVersesByJuz,
  getTranslationId,
} from "@/lib/quran-foundation";
import type { GoalSetup, VerseItem } from "@/lib/types";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Surah name → chapter number lookup (comprehensive)
// ---------------------------------------------------------------------------

const SURAH_NAME_TO_CHAPTER: Record<string, number> = {
  fatiha: 1, fatihah: 1,
  baqarah: 2, baqara: 2,
  imran: 3,
  nisa: 4, nisaa: 4,
  maidah: 5, maida: 5,
  anam: 6,
  araf: 7,
  anfal: 8,
  tawbah: 9, tawba: 9, toba: 9,
  yunus: 10, jonas: 10,
  hud: 11,
  yusuf: 12, joseph: 12,
  rad: 13, raad: 13,
  ibrahim: 14, abraham: 14,
  hijr: 15,
  nahl: 16,
  isra: 17,
  kahf: 18, cave: 18,
  maryam: 19, mary: 19,
  taha: 20,
  anbya: 21, anbiya: 21,
  hajj: 22,
  muminun: 23, muminoon: 23,
  nur: 24, noor: 24, light: 24,
  furqan: 25,
  shuara: 26,
  naml: 27,
  qasas: 28,
  ankabut: 29,
  rum: 30,
  luqman: 31,
  sajdah: 32, sajda: 32,
  ahzab: 33,
  saba: 34,
  fatir: 35,
  yasin: 36, yaseen: 36,
  saffat: 37,
  sad: 38,
  zumar: 39,
  ghafir: 40,
  fussilat: 41,
  shura: 42, shuraa: 42,
  zukhruf: 43,
  dukhan: 44,
  jathiyah: 45, jathiya: 45,
  ahqaf: 46,
  muhammad: 47,
  fath: 48, fatah: 48,
  hujurat: 49,
  qaf: 50,
  dhariyat: 51,
  tur: 52,
  najm: 53,
  qamar: 54,
  rahman: 55,
  waqiah: 56, waqia: 56,
  hadid: 57,
  mujadila: 58, mujadilah: 58,
  hashr: 59,
  mumtahanah: 60, mumtahina: 60,
  saf: 61, saff: 61,
  jumuah: 62, jumua: 62,
  munafiqun: 63, munafiqoon: 63,
  taghabun: 64,
  talaq: 65,
  tahrim: 66,
  mulk: 67,
  qalam: 68,
  haqqah: 69, haqqa: 69,
  maarij: 70,
  nuh: 71, noah: 71,
  jinn: 72,
  muzzammil: 73,
  muddaththir: 74, muddathir: 74,
  qiyamah: 75, qiyama: 75,
  insan: 76,
  mursalat: 77,
  naba: 78,
  naziat: 79,
  abasa: 80,
  takwir: 81,
  infitar: 82,
  mutaffifin: 83,
  inshiqaq: 84,
  buruj: 85,
  tariq: 86,
  ala: 87,
  ghashiyah: 88, ghashiya: 88,
  fajr: 89,
  balad: 90,
  shams: 91,
  layl: 92,
  duhaa: 93, duha: 93,
  sharh: 94, inshirah: 94,
  tin: 95,
  alaq: 96,
  qadr: 97,
  bayyinah: 98, bayyina: 98,
  zalzalah: 99, zalzala: 99,
  adiyat: 100,
  qariah: 101, qaria: 101,
  takathur: 102,
  asr: 103,
  humazah: 104, humaza: 104,
  fil: 105,
  quraysh: 106,
  maun: 107,
  kawthar: 108, kauthar: 108,
  kafirun: 109, kafiroon: 109,
  nasr: 110,
  masad: 111, lahab: 111,
  ikhlas: 112,
  falaq: 113,
  nas: 114, naas: 114,
};

// ---------------------------------------------------------------------------
// Juz → starting chapter
// ---------------------------------------------------------------------------

const JUZ_TO_START_CHAPTER: Record<number, number> = {
  1: 1, 2: 2, 3: 2, 4: 3, 5: 4, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8,
  11: 9, 12: 11, 13: 12, 14: 15, 15: 17, 16: 18, 17: 21, 18: 23,
  19: 25, 20: 27, 21: 29, 22: 33, 23: 36, 24: 39, 25: 41, 26: 46,
  27: 51, 28: 58, 29: 67, 30: 78,
};

// ---------------------------------------------------------------------------
// Theme → curated chapter lists (expanded)
// ---------------------------------------------------------------------------

const THEME_TO_CHAPTERS: Record<string, number[]> = {
  sabr: [2, 3, 13, 29, 31, 94],
  patience: [2, 3, 13, 29, 31, 94],
  rizq: [2, 11, 15, 55, 65, 67],
  provision: [2, 11, 15, 55, 65, 67],
  mercy: [1, 7, 21, 39, 55, 93],
  guidance: [1, 2, 17, 18, 20, 31],
  gratitude: [14, 16, 27, 31, 34, 55],
  stress: [13, 39, 65, 93, 94],
  ease: [13, 39, 65, 93, 94],
};

// ---------------------------------------------------------------------------
// Theme keyword filter for verse relevance scoring
// ---------------------------------------------------------------------------

const THEME_KEYWORDS: Record<string, string[]> = {
  sabr: ["patient", "patience", "steadfast", "persevere", "hardship", "endure", "bear"],
  patience: ["patient", "patience", "steadfast", "persevere", "hardship", "endure", "bear"],
  rizq: ["provide", "provided", "provision", "sustenance", "spend", "wealth", "rich"],
  provision: ["provide", "provided", "provision", "sustenance", "spend", "wealth", "rich"],
  mercy: ["mercy", "merciful", "forgive", "compassion", "pardon", "kind"],
  guidance: ["guide", "guidance", "path", "truth", "straight", "lead", "light"],
  gratitude: ["grateful", "thanks", "blessing", "favor", "bounty", "grace"],
  stress: ["fear", "anxious", "calm", "hope", "trust", "ease", "difficulty", "relief"],
  ease: ["fear", "anxious", "calm", "hope", "trust", "ease", "difficulty", "relief"],
};

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

function normalizeGoalText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^(surah|chapter|juz)/, "")
    .replace(/^al/, "");
}

function pickChapterFromGoal(goal: GoalSetup): number {
  const normalized = goal.target.toLowerCase().trim();
  const compactTarget = normalizeGoalText(goal.target);

  if (goal.goalType === "khatam") {
    const juzMatch = normalized.match(/juz\s*(\d{1,2})/i);
    if (juzMatch) {
      const juz = Number(juzMatch[1]);
      if (juz >= 1 && juz <= 30) return JUZ_TO_START_CHAPTER[juz] ?? 1;
    }
    return 1;
  }

  const numberMatch = normalized.match(/(chapter|surah)?\s*(\d{1,3})/i);
  if (numberMatch) {
    const chapter = Number(numberMatch[2]);
    if (chapter >= 1 && chapter <= 114) return chapter;
  }

  for (const [name, chapter] of Object.entries(SURAH_NAME_TO_CHAPTER)) {
    if (normalized.includes(name) || compactTarget.includes(name)) return chapter;
  }

  return 2;
}

function pickJuzFromGoal(goal: GoalSetup): number | null {
  if (goal.goalType !== "khatam") return null;
  const match = goal.target.toLowerCase().match(/juz\s*(\d{1,2})/i);
  if (match) {
    const juz = Number(match[1]);
    return juz >= 1 && juz <= 30 ? juz : null;
  }
  return null;
}

function pickThemeChapters(theme: string): number[] {
  const normalized = theme.toLowerCase();
  for (const [key, chapters] of Object.entries(THEME_TO_CHAPTERS)) {
    if (normalized.includes(key)) return chapters;
  }
  return [2, 36, 55, 67, 93, 94];
}

function filterThemeVerses(verses: VerseItem[], theme: string): VerseItem[] {
  const normalized = theme.toLowerCase();

  const selectedKeywords =
    Object.entries(THEME_KEYWORDS).find(([key]) => normalized.includes(key))?.[1] ??
    normalized.split(/\s+/).filter((w) => w.length > 2).slice(0, 5);

  if (!selectedKeywords.length) return verses;

  const filtered = verses.filter((verse) => {
    const text = `${verse.translation} ${verse.arabic}`.toLowerCase();
    return selectedKeywords.some((keyword) => text.includes(keyword));
  });

  // Return at least 21 verses for 7-day plan
  return filtered.length >= 21 ? filtered : verses;
}

// ---------------------------------------------------------------------------
// POST /api/plan
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const goal = (await request.json()) as GoalSetup;

  if (!goal?.goalType || !goal?.target || !goal?.timePerDayMinutes) {
    return NextResponse.json(
      { error: "Missing required goal setup fields" },
      { status: 400 },
    );
  }

  const translationId = getTranslationId(goal.language || "English");
  let quranVerses: VerseItem[] = [];
  let contentSource = "demo-fallback";

  try {
    if (goal.goalType === "khatam") {
      const juz = pickJuzFromGoal(goal);
      if (juz) {
        quranVerses = await fetchVersesByJuz(juz, 70, translationId);
      }
      if (!quranVerses.length) {
        const chapter = pickChapterFromGoal(goal);
        quranVerses = await fetchVersesByChapter(chapter, 70, translationId);
      }
    } else if (goal.goalType === "theme") {
      const themeChapters = pickThemeChapters(goal.target);
      const chapterResults = await Promise.all(
        themeChapters.map((ch) => fetchVersesByChapter(ch, 50, translationId)),
      );
      quranVerses = chapterResults.flat();
    } else {
      const chapter = pickChapterFromGoal(goal);
      quranVerses = await fetchVersesByChapter(chapter, 70, translationId);
    }

    if (quranVerses.length > 0) contentSource = "quran-foundation";
  } catch {
    // Fall through to demo fallback
  }

  const source = quranVerses.length > 0 ? quranVerses : DEMO_VERSES;

  const finalVerses =
    goal.goalType === "theme" ? filterThemeVerses(source, goal.target) : source;

  const plan = buildSevenDayPlan(goal, finalVerses);

  return NextResponse.json({
    plan,
    meta: {
      contentSource,
      versesAvailable: finalVerses.length,
      themeFiltered: goal.goalType === "theme" && finalVerses.length !== source.length,
    },
  });
}
