import { DEMO_VERSES } from "@/lib/demo-content";
import { buildSevenDayPlan } from "@/lib/planner";
import { fetchQuranFoundationVerses } from "@/lib/quran-foundation";
import type { GoalSetup, VerseItem } from "@/lib/types";
import { NextResponse } from "next/server";

const SURAH_NAME_TO_CHAPTER: Record<string, number> = {
  fatiha: 1,
  baqarah: 2,
  imran: 3,
  nisa: 4,
  maidah: 5,
  anam: 6,
  araf: 7,
  anfal: 8,
  tawbah: 9,
  yunus: 10,
  yusuf: 12,
  rahman: 55,
  mulk: 67,
  ikhlas: 112,
  waqiah: 56,
};

const JUZ_TO_START_CHAPTER: Record<number, number> = {
  1: 1,
  2: 2,
  3: 2,
  4: 3,
  5: 4,
  6: 4,
  7: 5,
  8: 6,
  9: 7,
  10: 8,
  11: 9,
  12: 11,
  13: 12,
  14: 15,
  15: 17,
  16: 18,
  17: 21,
  18: 23,
  19: 25,
  20: 27,
  21: 29,
  22: 33,
  23: 36,
  24: 39,
  25: 41,
  26: 46,
  27: 51,
  28: 58,
  29: 67,
  30: 78,
};

const THEME_TO_CHAPTERS: Record<string, number[]> = {
  sabr: [2, 3, 29, 94],
  rizq: [2, 11, 55, 65],
  mercy: [1, 7, 39, 93],
  guidance: [1, 2, 17, 18],
  gratitude: [14, 16, 31, 55],
  stress: [13, 39, 65, 94],
};

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
      if (juz >= 1 && juz <= 30) {
        return JUZ_TO_START_CHAPTER[juz] ?? 1;
      }
    }
    return 1;
  }

  const numberMatch = normalized.match(/(chapter|surah)?\s*(\d{1,3})/i);
  if (numberMatch) {
    const chapter = Number(numberMatch[2]);
    if (chapter >= 1 && chapter <= 114) {
      return chapter;
    }
  }

  for (const [name, chapter] of Object.entries(SURAH_NAME_TO_CHAPTER)) {
    if (normalized.includes(name) || compactTarget.includes(name)) {
      return chapter;
    }
  }

  return 2;
}

function pickThemeChapters(theme: string): number[] {
  const normalized = theme.toLowerCase();
  const matched = Object.entries(THEME_TO_CHAPTERS).find(([key]) =>
    normalized.includes(key),
  );

  return matched?.[1] ?? [2, 36, 55, 94];
}

function filterThemeVerses(verses: VerseItem[], theme: string): VerseItem[] {
  const normalized = theme.toLowerCase();

  const keywordGroups: Record<string, string[]> = {
    sabr: ["patient", "patience", "steadfast", "persevere", "hardship"],
    rizq: ["provide", "provided", "provision", "sustenance", "spend"],
    mercy: ["mercy", "merciful", "forgive", "compassion"],
    guidance: ["guide", "guidance", "path", "truth"],
    gratitude: ["grateful", "thanks", "blessing", "favor"],
    stress: ["fear", "anxious", "calm", "hope", "trust"],
  };

  const selectedKeywords =
    Object.entries(keywordGroups).find(([key]) => normalized.includes(key))?.[1] ??
    normalized
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .slice(0, 5);

  if (!selectedKeywords.length) {
    return verses;
  }

  const filtered = verses.filter((verse) => {
    const text = `${verse.translation} ${verse.arabic}`.toLowerCase();
    return selectedKeywords.some((keyword) => text.includes(keyword));
  });

  return filtered.length ? filtered : verses;
}

function getTranslationId(language: string): number {
  const norm = language.toLowerCase();
  if (norm.includes("urdu")) return 54;
  if (norm.includes("spanish")) return 83;
  if (norm.includes("french")) return 31;
  return 85; // Default English (M.A.S. Abdel Haleem)
}

export async function POST(request: Request) {
  const goal = (await request.json()) as GoalSetup;

  if (!goal?.goalType || !goal?.target || !goal?.timePerDayMinutes) {
    return NextResponse.json(
      { error: "Missing required goal setup fields" },
      { status: 400 },
    );
  }

  const chapterNumber = pickChapterFromGoal(goal);
  const themeChapters =
    goal.goalType === "theme" ? pickThemeChapters(goal.target) : [chapterNumber];

  const translationId = getTranslationId(goal.language || "English");

  const chapterSources = await Promise.all(
    themeChapters.map((chapter) => fetchQuranFoundationVerses(chapter, 100, translationId)),
  );

  const quranVerses = chapterSources.flat();
  const defaultSource = quranVerses.length ? quranVerses : DEMO_VERSES;
  const contentSource = quranVerses.length ? "quran-foundation" : "demo-fallback";

  const source =
    goal.goalType === "theme"
      ? filterThemeVerses(defaultSource, goal.target)
      : defaultSource;

  const themeFiltered = goal.goalType === "theme" && source.length !== defaultSource.length;

  const plan = buildSevenDayPlan(goal, source);

  return NextResponse.json({
    plan,
    meta: {
      chapterNumber,
      contentSource,
      themeFiltered,
      themeChapters,
    },
  });
}
