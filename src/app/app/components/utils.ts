"use client";

import type { JourneyState, SessionLog, WeeklyInsight, MoodTag } from "./types";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function toDateOnly(date: Date): string {
  const offset = date.getTimezoneOffset();
  const adjustedDate = new Date(date.getTime() - offset * 60 * 1000);
  return adjustedDate.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Streak calculation
// ---------------------------------------------------------------------------

export function calculateStreak(logs: SessionLog[]): number {
  const completedSet = new Set(
    logs.filter((log) => log.completed).map((log) => log.date),
  );
  let streak = 0;
  const cursor = new Date();

  const todayKey = toDateOnly(cursor);
  if (completedSet.has(todayKey)) {
    streak += 1;
  }

  cursor.setDate(cursor.getDate() - 1);

  for (;;) {
    const key = toDateOnly(cursor);
    if (!completedSet.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

// ---------------------------------------------------------------------------
// Minutes calculations
// ---------------------------------------------------------------------------

export function calculateMonthMinutes(logs: SessionLog[]): number {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  return logs.reduce((sum, log) => {
    const date = new Date(log.date);
    if (date.getMonth() === thisMonth && date.getFullYear() === thisYear) {
      return sum + log.minutesSpent;
    }
    return sum;
  }, 0);
}

export function calculateTotalMinutes(logs: SessionLog[]): number {
  return logs.reduce((sum, log) => sum + log.minutesSpent, 0);
}

// ---------------------------------------------------------------------------
// Weekly insight builder
// ---------------------------------------------------------------------------

export function buildWeeklyInsight(logs: SessionLog[]): WeeklyInsight {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

  const recentLogs = logs.filter((log) => {
    const day = new Date(log.date);
    return day >= sevenDaysAgo;
  });

  const completed = recentLogs.filter((log) => log.completed);
  const totalMinutes = completed.reduce((sum, log) => sum + log.minutesSpent, 0);
  const averageClarity = completed.length
    ? Number(
        (
          completed.reduce((sum, log) => sum + log.clarityRating, 0) /
          completed.length
        ).toFixed(1),
      )
    : 0;

  const moodCounts = completed.reduce<Record<string, number>>((acc, log) => {
    acc[log.moodTag] = (acc[log.moodTag] ?? 0) + 1;
    return acc;
  }, {});

  const topMood = (Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]
    ?.[0] ?? "none") as MoodTag | "none";

  const consistencyScore = Math.min(
    100,
    Math.round((completed.length / 7) * 60 + Math.min(totalMinutes / 2, 40)),
  );

  return {
    totalMinutes,
    completedSessions: completed.length,
    topMood,
    averageClarity,
    consistencyScore,
  };
}

// ---------------------------------------------------------------------------
// Verse review insertion
// ---------------------------------------------------------------------------

export function addReviewVerseToPlan(
  plan: JourneyState["plan"],
  reviewVerse: JourneyState["plan"][number]["verses"][number],
) {
  const targetIndex = plan.findIndex((day) => !day.completed);
  if (targetIndex < 0) return plan;

  const targetDay = plan[targetIndex];
  if (targetDay.verses.some((verse) => verse.key === reviewVerse.key)) return plan;

  const withReview = [reviewVerse, ...targetDay.verses];
  const trimmedVerses = withReview.slice(0, Math.max(2, targetDay.verses.length));

  const updatedDay = {
    ...targetDay,
    fromAyahKey: trimmedVerses[0].key,
    toAyahKey: trimmedVerses[trimmedVerses.length - 1].key,
    estimatedMinutes: Math.max(8, Math.round(trimmedVerses.length * 2.4)),
    verses: trimmedVerses,
  };

  return plan.map((day, index) => (index === targetIndex ? updatedDay : day));
}
