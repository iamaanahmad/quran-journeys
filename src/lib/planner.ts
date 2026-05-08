import type { GoalSetup, LengthRating, SessionPlanDay, VerseItem } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatISODate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const offset = date.getTimezoneOffset();
  const adjusted = new Date(date.getTime() - offset * 60 * 1000);
  return adjusted.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Ayah count estimator
// ---------------------------------------------------------------------------

export function estimateAyahsPerDay(minutes: number): number {
  const baseline = Math.round(minutes / 3);
  return clamp(baseline, 3, 8);
}

// ---------------------------------------------------------------------------
// Build a 7-day plan from any verse source
// ---------------------------------------------------------------------------

export function buildSevenDayPlan(
  goal: GoalSetup,
  sourceVerses: VerseItem[],
): SessionPlanDay[] {
  if (!sourceVerses.length) return [];

  const baselineCount = estimateAyahsPerDay(goal.timePerDayMinutes);
  const ayahsPerDay =
    goal.goalType === "theme"
      ? clamp(baselineCount - 1, 2, 7)
      : goal.goalType === "khatam"
        ? clamp(baselineCount + 1, 4, 9)
        : baselineCount;

  const plan: SessionPlanDay[] = [];

  for (let day = 0; day < 7; day += 1) {
    const start = day * ayahsPerDay;
    const verses: VerseItem[] = [];

    for (let index = 0; index < ayahsPerDay; index += 1) {
      const realIndex = start + index;
      if (realIndex >= sourceVerses.length) break;
      const verse = sourceVerses[realIndex];
      if (verse) verses.push(verse);
    }

    if (verses.length === 0) break;

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

// ---------------------------------------------------------------------------
// Adjust remaining (uncompleted) days based on length feedback
// ---------------------------------------------------------------------------

export function adjustRemainingPlan(
  plan: SessionPlanDay[],
  lengthRating: LengthRating,
): SessionPlanDay[] {
  const allVerses = plan.flatMap((day) => day.verses);

  const delta =
    lengthRating === "too_long" ? -1 : lengthRating === "too_short" ? 1 : 0;

  if (delta === 0) return plan;

  return plan.map((day) => {
    if (day.completed) return day;

    const currentCount = day.verses.length;
    const targetCount = clamp(currentCount + delta, 2, 9);

    if (targetCount === currentCount) return day;

    const firstKey = day.verses[0]?.key;
    const startIndex = Math.max(
      0,
      allVerses.findIndex((verse) => verse.key === firstKey),
    );

    const verses: VerseItem[] = [];
    for (let index = 0; index < targetCount; index += 1) {
      const verse = allVerses[startIndex + index];
      if (verse) verses.push(verse);
    }

    if (verses.length === 0) return day;

    return {
      ...day,
      fromAyahKey: verses[0].key,
      toAyahKey: verses[verses.length - 1].key,
      estimatedMinutes: Math.max(8, Math.round(verses.length * 2.4)),
      verses,
    };
  });
}
