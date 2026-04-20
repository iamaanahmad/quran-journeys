import { DEMO_VERSES } from "@/lib/demo-content";
import type { GoalSetup, LengthRating, SessionPlanDay } from "@/lib/types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatISODate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function estimateAyahsPerDay(minutes: number): number {
  const baseline = Math.round(minutes / 3);
  return clamp(baseline, 3, 8);
}

function getStartIndex(goal: GoalSetup, sourceVerses: typeof DEMO_VERSES): number {
  const normalizedTarget = goal.target.toLowerCase().trim();

  const ayahKeyMatch = normalizedTarget.match(/(\d{1,3}:\d{1,3})/);
  if (ayahKeyMatch) {
    const index = sourceVerses.findIndex((verse) => verse.key === ayahKeyMatch[1]);
    if (index >= 0) {
      return index;
    }
  }

  const surahMatch = normalizedTarget.match(/(chapter|surah)?\s*(\d{1,3})/i);
  if (surahMatch) {
    const surahNumber = Number(surahMatch[2]);
    const index = sourceVerses.findIndex((verse) => verse.surah === surahNumber);
    if (index >= 0) {
      return index;
    }
  }

  return 0;
}

export function buildSevenDayPlan(
  goal: GoalSetup,
  sourceVerses = DEMO_VERSES,
): SessionPlanDay[] {
  const baselineCount = estimateAyahsPerDay(goal.timePerDayMinutes);
  const ayahsPerDay =
    goal.goalType === "theme"
      ? clamp(baselineCount - 1, 2, 7)
      : goal.goalType === "khatam"
        ? clamp(baselineCount + 1, 4, 9)
        : baselineCount;

  const startIndex = getStartIndex(goal, sourceVerses);
  const plan: SessionPlanDay[] = [];

  for (let day = 0; day < 7; day += 1) {
    const start = startIndex + day * ayahsPerDay;
    const verses = [];
    for (let index = 0; index < ayahsPerDay; index += 1) {
      const verse = sourceVerses[start + index];
      if (verse) {
        verses.push(verse);
      }
    }

    if (verses.length === 0) {
      break;
    }

    plan.push({
      dayIndex: day + 1,
      date: formatISODate(day),
      fromAyahKey: verses[0].key,
      toAyahKey: verses[verses.length - 1].key,
      estimatedMinutes: Math.max(8, Math.round(verses.length * 2.4)),
      verses,
      completed: false,
    });
  }

  return plan;
}

export function adjustRemainingPlan(
  plan: SessionPlanDay[],
  lengthRating: LengthRating,
): SessionPlanDay[] {
  const catalog = Array.from(
    new Map(
      plan.flatMap((day) => day.verses).map((verse) => [verse.key, verse]),
    ).values(),
  );
  const versePool = catalog.length ? catalog : DEMO_VERSES;

  const delta =
    lengthRating === "too_long" ? -1 : lengthRating === "too_short" ? 1 : 0;

  if (delta === 0) {
    return plan;
  }

  return plan.map((day) => {
    if (day.completed) {
      return day;
    }

    const currentCount = day.verses.length;
    const targetCount = clamp(currentCount + delta, 2, 9);

    if (targetCount === currentCount) {
      return day;
    }

    const firstKey = day.verses[0]?.key;
    const startIndex = Math.max(
      0,
      versePool.findIndex((verse) => verse.key === firstKey),
    );

    const verses = [];
    for (let index = 0; index < targetCount; index += 1) {
      const verse = versePool[startIndex + index];
      if (verse) {
        verses.push(verse);
      }
    }

    if (verses.length === 0) {
      return day;
    }

    return {
      ...day,
      fromAyahKey: verses[0].key,
      toAyahKey: verses[verses.length - 1].key,
      estimatedMinutes: Math.max(8, Math.round(verses.length * 2.4)),
      verses,
    };
  });
}
