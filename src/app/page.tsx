"use client";

import {
  clearJourneyStateFromPrefs,
  getCurrentAuthUser,
  loadJourneyStateFromPrefs,
  saveJourneyStateToPrefs,
  signOutCurrentUser,
  type AuthUser,
} from "@/lib/supabase-journey";
import { adjustRemainingPlan } from "@/lib/planner";
import type {
  ExplanationResult,
  GoalSetup,
  JourneyState,
  LengthRating,
  MoodTag,
  SessionLog,
  SessionPlanDay,
  UserProgressSyncRequest,
  UserProgressSyncResponse,
  VerseItem,
} from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "quran-journeys-state";
const USER_PROGRESS_ID_KEY = "quran-journeys-progress-user-id";
const CIRCLE_MEMBERS_KEY = "quran-journeys-circle-members";
const TOUR_DISMISSED_KEY = "quran-journeys-tour-dismissed";

const defaultGoal: GoalSetup = {
  goalType: "surah",
  target: "Surah Al-Baqarah",
  timePerDayMinutes: 15,
  language: "English",
  profileRole: "Developer",
};

const moodOptions: MoodTag[] = [
  "calm",
  "hopeful",
  "anxious",
  "grateful",
  "focused",
  "tired",
];

const themeSuggestions = [
  "Sabr (Patience)",
  "Rizq (Provision)",
  "Mercy",
  "Guidance",
  "Gratitude",
  "Stress Relief",
];

interface ApiEvidence {
  contentSource: "quran-foundation" | "demo-fallback" | "unknown";
  contentCheckedAt: string | null;
  contentDetails: string;
  userProgressSource: "quran-foundation" | "local-fallback" | "unknown";
  userProgressCheckedAt: string | null;
  userProgressDetails: string;
}

interface WeeklyInsight {
  totalMinutes: number;
  completedSessions: number;
  topMood: MoodTag | "none";
  averageClarity: number;
  consistencyScore: number;
}

type SessionStep = "read" | "understand" | "reflect";

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function calculateStreak(logs: SessionLog[]): number {
  const completedSet = new Set(
    logs.filter((log) => log.completed).map((log) => log.date),
  );
  let streak = 0;
  const cursor = new Date();

  for (;;) {
    const key = toDateOnly(cursor);
    if (!completedSet.has(key)) {
      break;
    }
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function calculateMonthMinutes(logs: SessionLog[]): number {
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

function calculateTotalMinutes(logs: SessionLog[]): number {
  return logs.reduce((sum, log) => sum + log.minutesSpent, 0);
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

function addReviewVerseToPlan(
  plan: SessionPlanDay[],
  reviewVerse: VerseItem,
): SessionPlanDay[] {
  const targetIndex = plan.findIndex((day) => !day.completed);
  if (targetIndex < 0) {
    return plan;
  }

  const targetDay = plan[targetIndex];
  if (targetDay.verses.some((verse) => verse.key === reviewVerse.key)) {
    return plan;
  }

  const withReview = [reviewVerse, ...targetDay.verses];
  const trimmedVerses = withReview.slice(0, Math.max(2, targetDay.verses.length));

  const updatedDay: SessionPlanDay = {
    ...targetDay,
    fromAyahKey: trimmedVerses[0].key,
    toAyahKey: trimmedVerses[trimmedVerses.length - 1].key,
    estimatedMinutes: Math.max(8, Math.round(trimmedVerses.length * 2.4)),
    verses: trimmedVerses,
  };

  return plan.map((day, index) => (index === targetIndex ? updatedDay : day));
}

function buildWeeklyInsight(logs: SessionLog[]): WeeklyInsight {
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

  const moodCounts = completed.reduce<Record<string, number>>((accumulator, log) => {
    accumulator[log.moodTag] = (accumulator[log.moodTag] ?? 0) + 1;
    return accumulator;
  }, {});

  const topMood = (Object.entries(moodCounts).sort((left, right) => right[1] - left[1])[0]
    ?. [0] ?? "none") as MoodTag | "none";

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

export default function Home() {
  const [goalForm, setGoalForm] = useState<GoalSetup>(defaultGoal);
  const [state, setState] = useState<JourneyState | null>(null);
  const [step, setStep] = useState<SessionStep>("read");
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [loadingExplain, setLoadingExplain] = useState(false);
  const [explanation, setExplanation] = useState<ExplanationResult | null>(null);
  const [reflectionText, setReflectionText] = useState("");
  const [moodTag, setMoodTag] = useState<MoodTag>("calm");
  const [lengthRating, setLengthRating] = useState<LengthRating>("ok");
  const [clarityRating, setClarityRating] = useState(4);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [syncState, setSyncState] = useState<{
    source:
      | "supabase"
      | "quran-foundation"
      | "local-fallback"
      | "not-synced";
    message: string;
  }>({
    source: "not-synced",
    message: "Not synced yet",
  });
  const [apiEvidence, setApiEvidence] = useState<ApiEvidence>({
    contentSource: "unknown",
    contentCheckedAt: null,
    contentDetails: "No plan generated yet",
    userProgressSource: "unknown",
    userProgressCheckedAt: null,
    userProgressDetails: "No user-progress check yet",
  });
  const [circleMembers, setCircleMembers] = useState<string[]>([]);
  const [newCircleMember, setNewCircleMember] = useState("");
  const [tourDismissed, setTourDismissed] = useState(false);
  const [runtimeNotice, setRuntimeNotice] = useState("");
  const [sessionFeedbackMessage, setSessionFeedbackMessage] = useState("");

  const updateSyncState = useCallback(
    (next: {
      source: "supabase" | "quran-foundation" | "local-fallback" | "not-synced";
      message: string;
    }) => {
      setSyncState((previous) =>
        previous.source === next.source && previous.message === next.message
          ? previous
          : next,
      );
    },
    [],
  );

  useEffect(() => {
    const raw = window.localStorage.getItem(CIRCLE_MEMBERS_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as string[];
      setCircleMembers(parsed.slice(0, 3));
    } catch {
      window.localStorage.removeItem(CIRCLE_MEMBERS_KEY);
    }
  }, []);

  useEffect(() => {
    const dismissed = window.localStorage.getItem(TOUR_DISMISSED_KEY);
    setTourDismissed(dismissed === "1");
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CIRCLE_MEMBERS_KEY, JSON.stringify(circleMembers));
  }, [circleMembers]);

  useEffect(() => {
    if (!state) {
      return;
    }

    if (authUser) {
      void saveJourneyStateToPrefs(state);
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, authUser]);

  const currentDay = useMemo(() => {
    if (!state?.plan.length) {
      return null;
    }
    return state.plan.find((planDay) => !planDay.completed) ?? null;
  }, [state]);

  const completedDays = useMemo(() => {
    return state?.plan.filter((day) => day.completed).length ?? 0;
  }, [state]);

  const progress = state?.plan.length
    ? Math.round((completedDays / state.plan.length) * 100)
    : 0;

  const streak = useMemo(() => {
    return state ? calculateStreak(state.logs) : 0;
  }, [state]);

  const monthMinutes = useMemo(() => {
    if (!state) {
      return 0;
    }

    return calculateMonthMinutes(state.logs);
  }, [state]);

  const weeklyInsight = useMemo(() => {
    return buildWeeklyInsight(state?.logs ?? []);
  }, [state]);

  function addCircleMember() {
    const trimmed = newCircleMember.trim();
    if (!trimmed) {
      return;
    }

    setCircleMembers((previous) => {
      if (previous.includes(trimmed) || previous.length >= 3) {
        return previous;
      }
      return [...previous, trimmed];
    });

    setNewCircleMember("");
  }

  function removeCircleMember(member: string) {
    setCircleMembers((previous) => previous.filter((item) => item !== member));
  }

  function dismissTour() {
    setTourDismissed(true);
    window.localStorage.setItem(TOUR_DISMISSED_KEY, "1");
  }

  async function copyWeeklySummary(): Promise<void> {
    const summary = [
      "Quran Journeys Weekly Insight",
      `Sessions completed: ${weeklyInsight.completedSessions}/7`,
      `Minutes spent: ${weeklyInsight.totalMinutes}`,
      `Top mood: ${weeklyInsight.topMood}`,
      `Average clarity: ${weeklyInsight.averageClarity}`,
      `Consistency score: ${weeklyInsight.consistencyScore}/100`,
      `Current streak: ${streak} days`,
      `Circle: ${circleMembers.length ? circleMembers.join(", ") : "No members yet"}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(summary);
    } catch {
      // Clipboard can fail in restricted contexts; no-op keeps flow smooth.
    }
  }

  const getProgressUserId = useCallback((user: AuthUser | null): string => {
    if (user?.id) {
      return user.id;
    }

    const existing = window.localStorage.getItem(USER_PROGRESS_ID_KEY);
    if (existing) {
      return existing;
    }

    const generated =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? `guest-${crypto.randomUUID()}`
        : `guest-${Date.now()}`;

    window.localStorage.setItem(USER_PROGRESS_ID_KEY, generated);
    return generated;
  }, []);

  const refreshUserProgressStatus = useCallback(async (userId: string): Promise<void> => {
    try {
      const response = await fetch(
        `/api/user-progress?userId=${encodeURIComponent(userId)}`,
      );

      if (!response.ok) {
        throw new Error("User progress status request failed");
      }

      const payload = (await response.json()) as UserProgressSyncResponse;
      if (payload.source === "quran-foundation") {
        updateSyncState({
          source: "quran-foundation",
          message: "Connected to Quran Foundation User API",
        });
        setApiEvidence((previous) => ({
          ...previous,
          userProgressSource: "quran-foundation",
          userProgressCheckedAt: new Date().toISOString(),
          userProgressDetails: "Live user progress GET succeeded",
        }));
      } else {
        updateSyncState({
          source: "local-fallback",
          message:
            payload.warning ??
            "Using local fallback for user progress; QF credentials needed.",
        });
        setApiEvidence((previous) => ({
          ...previous,
          userProgressSource: "local-fallback",
          userProgressCheckedAt: new Date().toISOString(),
          userProgressDetails:
            payload.warning ?? "User progress GET fell back to local store",
        }));
      }
    } catch {
      setSyncState((previous) =>
        previous.source === "quran-foundation"
          ? previous
          : {
              source: "supabase",
              message: "Supabase is connected; Quran User API check is unavailable right now.",
            },
      );
    }
  }, [updateSyncState]);

  const syncUserProgress = useCallback(async (
    journeyState: JourneyState,
    userId: string,
  ): Promise<void> => {
    const completedLogs = journeyState.logs.filter((log) => log.completed);
    const latestCompletedDay = [...journeyState.plan]
      .filter((day) => day.completed)
      .sort((left, right) => right.dayIndex - left.dayIndex)[0];

    const payload: UserProgressSyncRequest = {
      userId,
      streakDays: calculateStreak(completedLogs),
      completedSessions: completedLogs.length,
      minutesThisMonth: calculateMonthMinutes(completedLogs),
      totalMinutes: calculateTotalMinutes(completedLogs),
      lastSessionDate:
        completedLogs.length > 0
          ? completedLogs
              .map((log) => log.date)
              .sort((left, right) => right.localeCompare(left))[0]
          : null,
      lastReadAyahKey:
        latestCompletedDay?.toAyahKey ?? journeyState.plan[0]?.fromAyahKey ?? null,
    };

    try {
      const response = await fetch("/api/user-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to sync user progress");
      }

      const result = (await response.json()) as UserProgressSyncResponse;
      if (result.source === "quran-foundation") {
        updateSyncState({
          source: "quran-foundation",
          message: "Connected to Quran Foundation User API",
        });
        setApiEvidence((previous) => ({
          ...previous,
          userProgressSource: "quran-foundation",
          userProgressCheckedAt: new Date().toISOString(),
          userProgressDetails: "Live user progress POST succeeded",
        }));
      } else {
        updateSyncState({
          source: "local-fallback",
          message:
            result.warning ??
            "Using local fallback for user progress; QF credentials needed.",
        });
        setApiEvidence((previous) => ({
          ...previous,
          userProgressSource: "local-fallback",
          userProgressCheckedAt: new Date().toISOString(),
          userProgressDetails:
            result.warning ?? "User progress POST fell back to local store",
        }));
      }
    } catch {
      const isGuestUser = userId.startsWith("guest-");
      setSyncState((previous) =>
        previous.source === "quran-foundation"
          ? previous
          : {
              source: isGuestUser ? "local-fallback" : "supabase",
              message: isGuestUser
                ? "Using local mode. Progress sync temporarily unavailable."
                : "Supabase is connected; Quran User API sync is unavailable right now.",
            },
      );
    }
  }, [updateSyncState]);

  useEffect(() => {
    async function bootstrap() {
      const localRaw = window.localStorage.getItem(STORAGE_KEY);
      const currentUser = await getCurrentAuthUser();
      if (currentUser) {
        setAuthUser(currentUser);
        updateSyncState({
          source: "supabase",
          message: "Connected to Supabase Auth. Checking Quran User API status...",
        });

        const remoteState = await loadJourneyStateFromPrefs();
        if (remoteState) {
          setState(remoteState);
          await refreshUserProgressStatus(currentUser.id);
          return;
        }

        if (localRaw) {
          try {
            const localState = JSON.parse(localRaw) as JourneyState;
            await saveJourneyStateToPrefs(localState);
            setState(localState);
            await syncUserProgress(localState, currentUser.id);
            return;
          } catch {
            window.localStorage.removeItem(STORAGE_KEY);
          }
        }

        await refreshUserProgressStatus(currentUser.id);
      }

      if (localRaw) {
        try {
          const localState = JSON.parse(localRaw) as JourneyState;
          setState(localState);

          const guestUserId = getProgressUserId(null);
          await syncUserProgress(localState, guestUserId);

          updateSyncState({
            source: "local-fallback",
            message:
              "Using local mode. Log in to sync with Supabase and Quran User API.",
          });
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
    }

    void bootstrap();
  }, [getProgressUserId, refreshUserProgressStatus, syncUserProgress, updateSyncState]);

  async function handleLogout() {
    try {
      await signOutCurrentUser();
    } finally {
      setAuthUser(null);
      updateSyncState({
        source: "local-fallback",
        message: "Logged out. Local mode active.",
      });
    }
  }

  async function createJourney() {
    setLoadingPlan(true);
    setExplanation(null);
    setStep("read");
    setRuntimeNotice("");

    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(goalForm),
      });

      if (!response.ok) {
        throw new Error("Unable to generate plan");
      }

      const payload = (await response.json()) as {
        plan: JourneyState["plan"];
        meta?: {
          chapterNumber: number;
          contentSource: "quran-foundation" | "demo-fallback";
          themeFiltered: boolean;
          themeChapters?: number[];
        };
      };

      const nextState: JourneyState = {
        createdAt: new Date().toISOString(),
        goal: goalForm,
        plan: payload.plan,
        logs: [],
      };

      setState(nextState);

      const contentSource = payload.meta?.contentSource ?? "demo-fallback";
      const contentDetails = payload.meta
        ? `chapter=${payload.meta.chapterNumber}, themeFiltered=${payload.meta.themeFiltered ? "yes" : "no"}${payload.meta.themeChapters?.length ? `, sources=${payload.meta.themeChapters.join("/")}` : ""}`
        : "meta unavailable";

      setApiEvidence((previous) => ({
        ...previous,
        contentSource,
        contentCheckedAt: new Date().toISOString(),
        contentDetails,
      }));

      const progressUserId = getProgressUserId(authUser);
      await syncUserProgress(nextState, progressUserId);
    } catch {
      setRuntimeNotice(
        "Plan API is temporarily slow or unavailable. Try again. Fallback data is still supported for demo continuity.",
      );
    } finally {
      setLoadingPlan(false);
    }
  }

  async function generateExplain() {
    if (!currentDay) {
      return;
    }

    setLoadingExplain(true);
    setRuntimeNotice("");

    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verses: currentDay.verses }),
      });

      if (!response.ok) {
        throw new Error("Unable to explain verses");
      }

      const payload = (await response.json()) as ExplanationResult;
      setExplanation(payload);
      setStep("understand");
    } catch {
      setRuntimeNotice(
        "Explain API is currently slow. You can continue reading/reflecting and retry Understand in a moment.",
      );
    } finally {
      setLoadingExplain(false);
    }
  }

  function completeSession() {
    if (!state || !currentDay) {
      return;
    }

    const updatedPlan = state.plan.map((day) => {
      if (day.dayIndex === currentDay.dayIndex) {
        return { ...day, completed: true };
      }
      return day;
    });

    const adaptedPlan = adjustRemainingPlan(updatedPlan, lengthRating);

    const log: SessionLog = {
      date: currentDay.date,
      completed: true,
      lengthRating,
      clarityRating,
      moodTag,
      reflectionText: reflectionText.trim(),
      minutesSpent: currentDay.estimatedMinutes,
    };

    const reviewVerse =
      clarityRating <= 2 || moodTag === "anxious" || moodTag === "tired"
        ? currentDay.verses[0]
        : null;

    const finalPlan = reviewVerse
      ? addReviewVerseToPlan(adaptedPlan, reviewVerse)
      : adaptedPlan;

    const lengthMessage =
      lengthRating === "too_long"
        ? "Tomorrow will be shorter"
        : lengthRating === "too_short"
          ? "Tomorrow will be slightly longer"
          : "Tomorrow keeps similar length";

    const reviewMessage = reviewVerse
      ? ` and includes review of ${reviewVerse.key}`
      : "";

    const nextState: JourneyState = {
      ...state,
      plan: finalPlan,
      logs: [...state.logs, log],
    };

    setState(nextState);
    const progressUserId = getProgressUserId(authUser);
    void syncUserProgress(nextState, progressUserId);
    setSessionFeedbackMessage(`Got it. ${lengthMessage}${reviewMessage}.`);

    setReflectionText("");
    setMoodTag("calm");
    setLengthRating("ok");
    setClarityRating(4);
    setExplanation(null);
    setStep("read");
  }

  function resetJourney() {
    window.localStorage.removeItem(STORAGE_KEY);
    if (authUser) {
      void clearJourneyStateFromPrefs();
    }
    setState(null);
    setExplanation(null);
    setReflectionText("");
    setStep("read");
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_#f7f1d8_0%,_#f8f4e8_35%,_#e8efe6_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 opacity-25 [background:linear-gradient(120deg,transparent_0%,rgba(13,95,78,0.08)_25%,transparent_55%),linear-gradient(0deg,rgba(189,147,69,0.06),rgba(189,147,69,0.06))]" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8">
        <header className="rounded-3xl border border-emerald-900/15 bg-white/70 p-6 backdrop-blur-md md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-900/80">
            Ramadan 2026 Hackathon Build
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-5xl">
            Quran Journeys for Busy Professionals
          </h1>
          <p className="mt-4 max-w-3xl text-sm text-slate-700 md:text-base">
            10-20 minute daily sessions with a guided flow: Read, Understand,
            Reflect. Plan adapts based on your feedback so consistency stays
            realistic even during intense work weeks.
          </p>
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            Problem: busy schedules break Quran consistency. Solution: Quran Journeys
            converts small daily windows into structured, AI-assisted engagement.
            Built on Quran Foundation / Quran.com APIs to support the mission of
            transforming every human through Quranic guidance.
          </p>
          <p className="mt-2 text-xs text-slate-600">
            Developer ecosystem: {" "}
            <a
              href="https://quran.com/developers"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-emerald-900 underline"
            >
              quran.com/developers
            </a>
            {" "}|{" "}
            <a
              href="https://api-docs.quran.foundation/docs/quickstart/"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-emerald-900 underline"
            >
              Quran Foundation API docs
            </a>
          </p>

          {runtimeNotice ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {runtimeNotice}
            </p>
          ) : null}

          <div className="mt-6 grid gap-3 rounded-2xl border border-emerald-900/10 bg-white/80 p-4">
            {authUser ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-700">
                  Signed in as <span className="font-semibold">{authUser.name}</span> (
                  {authUser.email})
                </p>
                <button
                  onClick={() => void handleLogout()}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Log Out
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/auth?mode=login&next=/"
                  className="rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
                >
                  Log In
                </Link>
                <Link
                  href="/auth?mode=signup&next=/"
                  className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-500"
                >
                  Sign Up
                </Link>
                <p className="text-xs text-slate-600">
                  Or continue as guest for instant demo access.
                </p>
              </div>
            )}

            <p className="text-xs text-slate-600">
              User API sync: {syncState.message}
              {authUser ? ` (${authUser.id})` : ""}
            </p>
          </div>
        </header>

        {!state ? (
          <section className="grid gap-6 rounded-3xl border border-emerald-900/15 bg-white/85 p-6 shadow-sm md:grid-cols-2 md:p-8">
            <div>
              <h2 className="text-2xl font-semibold">Onboarding & Goal Setup</h2>
              <p className="mt-2 text-sm text-slate-600">
                Configure your journey, then we will auto-generate a 7-day
                session plan from Quran content.
              </p>
            </div>

            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void createJourney();
              }}
            >
              <label className="grid gap-1 text-sm">
                Goal type
                <select
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                  value={goalForm.goalType}
                  onChange={(event) =>
                    setGoalForm({
                      ...goalForm,
                      goalType: event.target.value as GoalSetup["goalType"],
                    })
                  }
                >
                  <option value="khatam">Khatam Progress</option>
                  <option value="surah">Specific Surah</option>
                  <option value="theme">Theme Journey</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm">
                Target
                <input
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                  value={goalForm.target}
                  onChange={(event) =>
                    setGoalForm({ ...goalForm, target: event.target.value })
                  }
                  placeholder="Surah Al-Baqarah / Sabr / Juz 1"
                  required
                />
              </label>

              {goalForm.goalType === "theme" ? (
                <div className="grid gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Suggested themes
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {themeSuggestions.map((theme) => (
                      <button
                        key={theme}
                        type="button"
                        onClick={() =>
                          setGoalForm({
                            ...goalForm,
                            target: theme,
                          })
                        }
                        className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100"
                      >
                        {theme}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <label className="grid gap-1 text-sm">
                Daily time budget (minutes)
                <select
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                  value={goalForm.timePerDayMinutes}
                  onChange={(event) =>
                    setGoalForm({
                      ...goalForm,
                      timePerDayMinutes: Number(event.target.value),
                    })
                  }
                >
                  <option value={10}>10 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={20}>20 minutes</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm">
                Role / profile
                <input
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                  value={goalForm.profileRole}
                  onChange={(event) =>
                    setGoalForm({ ...goalForm, profileRole: event.target.value })
                  }
                  placeholder="Founder, developer, student"
                  required
                />
              </label>

              <label className="grid gap-1 text-sm">
                Translation language
                <input
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                  value={goalForm.language}
                  onChange={(event) =>
                    setGoalForm({ ...goalForm, language: event.target.value })
                  }
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loadingPlan}
                className="mt-2 rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingPlan ? "Generating Journey..." : "Generate 7-Day Plan"}
              </button>
            </form>
          </section>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-4">
              <article className="rounded-2xl border border-emerald-900/15 bg-white/85 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Goal
                </p>
                <p className="mt-2 text-lg font-semibold">{state.goal.target}</p>
              </article>
              <article className="rounded-2xl border border-emerald-900/15 bg-white/85 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Progress
                </p>
                <p className="mt-2 text-lg font-semibold">{progress}%</p>
              </article>
              <article className="rounded-2xl border border-emerald-900/15 bg-white/85 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Streak
                </p>
                <p className="mt-2 text-lg font-semibold">{streak} days</p>
              </article>
              <article className="rounded-2xl border border-emerald-900/15 bg-white/85 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Minutes this month
                </p>
                <p className="mt-2 text-lg font-semibold">{monthMinutes}</p>
              </article>
            </section>

            <section className="rounded-2xl border border-emerald-900/15 bg-white/85 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">
                Live API Evidence
              </h3>
              <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                <article className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Quran Content API
                  </p>
                  <p className="mt-1 font-semibold text-slate-800">
                    Source: {apiEvidence.contentSource}
                  </p>
                  <p className="text-xs text-slate-600">
                    Checked: {formatTimestamp(apiEvidence.contentCheckedAt)}
                  </p>
                  <p className="text-xs text-slate-600">{apiEvidence.contentDetails}</p>
                </article>
                <article className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Quran User API
                  </p>
                  <p className="mt-1 font-semibold text-slate-800">
                    Source: {apiEvidence.userProgressSource}
                  </p>
                  <p className="text-xs text-slate-600">
                    Checked: {formatTimestamp(apiEvidence.userProgressCheckedAt)}
                  </p>
                  <p className="text-xs text-slate-600">{apiEvidence.userProgressDetails}</p>
                </article>
              </div>
            </section>

            {!tourDismissed ? (
              <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-900">
                    Judge Tour (90 sec)
                  </h3>
                  <button
                    type="button"
                    onClick={dismissTour}
                    className="rounded-lg border border-sky-300 bg-white px-2 py-1 text-xs font-semibold text-sky-900"
                  >
                    Dismiss
                  </button>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-sky-900 md:grid-cols-4">
                  <p className="rounded-lg border border-sky-200 bg-white px-3 py-2">
                    1. Generate a plan from onboarding.
                  </p>
                  <p className="rounded-lg border border-sky-200 bg-white px-3 py-2">
                    2. Complete Read - Understand - Reflect flow.
                  </p>
                  <p className="rounded-lg border border-sky-200 bg-white px-3 py-2">
                    3. Check Live API Evidence panel for source proof.
                  </p>
                  <p className="rounded-lg border border-sky-200 bg-white px-3 py-2">
                    4. Open Weekly Insight and copy summary.
                  </p>
                </div>
              </section>
            ) : null}

            <section className="grid gap-4 rounded-2xl border border-emerald-900/15 bg-white/85 p-4 md:grid-cols-[1.2fr_1fr]">
              <article className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Weekly Insight
                </h3>
                <p className="mt-2 text-sm text-slate-700">
                  Sessions: <span className="font-semibold">{weeklyInsight.completedSessions}/7</span>
                </p>
                <p className="text-sm text-slate-700">
                  Minutes: <span className="font-semibold">{weeklyInsight.totalMinutes}</span>
                </p>
                <p className="text-sm text-slate-700">
                  Top mood: <span className="font-semibold">{weeklyInsight.topMood}</span>
                </p>
                <p className="text-sm text-slate-700">
                  Avg clarity: <span className="font-semibold">{weeklyInsight.averageClarity}</span>
                </p>
                <p className="text-sm text-slate-700">
                  Consistency score: <span className="font-semibold">{weeklyInsight.consistencyScore}/100</span>
                </p>
                <button
                  onClick={() => void copyWeeklySummary()}
                  className="mt-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Copy Weekly Summary
                </button>
              </article>

              <article className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Circles (Up to 3)
                </h3>
                <div className="mt-2 flex gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="Friend or family name"
                    value={newCircleMember}
                    onChange={(event) => setNewCircleMember(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={addCircleMember}
                    className="rounded-lg bg-emerald-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800"
                  >
                    Add
                  </button>
                </div>
                <div className="mt-3 grid gap-2">
                  {circleMembers.length ? (
                    circleMembers.map((member) => (
                      <div
                        key={member}
                        className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <span className="text-sm text-slate-700">{member}</span>
                        <button
                          type="button"
                          onClick={() => removeCircleMember(member)}
                          className="text-xs font-semibold text-rose-700"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-600">
                      Add 1-3 members to create accountability momentum.
                    </p>
                  )}
                </div>
              </article>
            </section>

            {currentDay ? (
              <section className="grid gap-6 rounded-3xl border border-emerald-900/15 bg-white/85 p-6 shadow-sm md:p-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-2xl font-semibold">
                    Day {currentDay.dayIndex}: {currentDay.fromAyahKey} -{" "}
                    {currentDay.toAyahKey}
                  </h2>
                  <p className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
                    ~{currentDay.estimatedMinutes} min
                  </p>
                </div>

                <div className="flex gap-2 text-xs font-semibold uppercase tracking-[0.15em]">
                  {(["read", "understand", "reflect"] as SessionStep[]).map(
                    (item) => (
                      <button
                        key={item}
                        onClick={() => setStep(item)}
                        className={`rounded-full px-3 py-1 ${
                          step === item
                            ? "bg-emerald-900 text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item}
                      </button>
                    ),
                  )}
                </div>

                {step === "read" && (
                  <div className="grid gap-4">
                    {currentDay.verses.map((verse) => (
                      <article
                        key={verse.key}
                        className="rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold tracking-[0.12em] text-slate-500">
                            {verse.key}
                          </p>
                          <audio controls preload="none" className="h-8 w-40">
                            <source src={verse.audioUrl} type="audio/mpeg" />
                          </audio>
                        </div>
                        <p className="arabic mt-3 text-right text-2xl leading-relaxed md:text-3xl">
                          {verse.arabic}
                        </p>
                        <p className="mt-3 text-sm leading-7 text-slate-700">
                          {verse.translation}
                        </p>
                      </article>
                    ))}

                    <button
                      onClick={() => void generateExplain()}
                      disabled={loadingExplain}
                      className="justify-self-start rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingExplain
                        ? "Generating explanation..."
                        : "Continue to Understand"}
                    </button>
                  </div>
                )}

                {step === "understand" && (
                  <div className="grid gap-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                    {explanation ? (
                      <>
                        <h3 className="text-lg font-semibold">Key points</h3>
                        <ul className="grid gap-2 text-sm leading-7 text-slate-700">
                          {explanation.keyPoints.map((item) => (
                            <li key={item}>- {item}</li>
                          ))}
                        </ul>
                        <h4 className="text-base font-semibold">In simple terms</h4>
                        <p className="text-sm leading-7 text-slate-700">
                          {explanation.simpleSummary}
                        </p>
                        <p className="rounded-xl bg-amber-100 px-3 py-2 text-xs text-amber-900">
                          {explanation.disclaimer}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {currentDay?.verses.slice(0, 3).map((verse) => (
                            <a
                              key={verse.key}
                              href={`https://quran.com/${verse.key.replace(":", "/")}?translations=131`}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-full border border-amber-300 bg-white px-3 py-1 font-semibold text-amber-900"
                            >
                              See source {verse.key}
                            </a>
                          ))}
                        </div>
                        <button
                          onClick={() => setStep("reflect")}
                          className="justify-self-start rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
                        >
                          Continue to Reflect
                        </button>
                      </>
                    ) : (
                      <p className="text-sm text-slate-700">
                        Generate explanation from the Read step first.
                      </p>
                    )}
                  </div>
                )}

                {step === "reflect" && (
                  <div className="grid gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <h3 className="text-lg font-semibold">Reflection & Feedback</h3>

                    {explanation?.reflectionPrompts?.length ? (
                      <ul className="grid gap-2 text-sm leading-7 text-slate-700">
                        {explanation.reflectionPrompts.map((prompt) => (
                          <li key={prompt}>- {prompt}</li>
                        ))}
                      </ul>
                    ) : null}

                    <label className="grid gap-1 text-sm">
                      Short reflection note
                      <textarea
                        rows={4}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                        value={reflectionText}
                        onChange={(event) => setReflectionText(event.target.value)}
                        placeholder="What stood out? What will you apply today?"
                      />
                    </label>

                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="grid gap-1 text-sm">
                        Mood tag
                        <select
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                          value={moodTag}
                          onChange={(event) =>
                            setMoodTag(event.target.value as MoodTag)
                          }
                        >
                          {moodOptions.map((item) => (
                            <option value={item} key={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-1 text-sm">
                        Session length felt
                        <select
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                          value={lengthRating}
                          onChange={(event) =>
                            setLengthRating(event.target.value as LengthRating)
                          }
                        >
                          <option value="too_short">Too short</option>
                          <option value="ok">Okay</option>
                          <option value="too_long">Too long</option>
                        </select>
                      </label>

                      <label className="grid gap-1 text-sm">
                        Clarity rating (1-5)
                        <input
                          type="number"
                          min={1}
                          max={5}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                          value={clarityRating}
                          onChange={(event) =>
                            setClarityRating(Number(event.target.value))
                          }
                        />
                      </label>
                    </div>

                    <button
                      onClick={completeSession}
                      className="justify-self-start rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
                    >
                      Complete Session
                    </button>

                    {sessionFeedbackMessage ? (
                      <p className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-900">
                        {sessionFeedbackMessage}
                      </p>
                    ) : null}
                  </div>
                )}
              </section>
            ) : (
              <section className="rounded-3xl border border-emerald-900/15 bg-white/85 p-8 text-center">
                <h2 className="text-2xl font-semibold">7-Day Plan Complete</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Great consistency. Start a fresh journey to continue building
                  your Quran habit.
                </p>
              </section>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                onClick={resetJourney}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Reset Journey
              </button>
            </div>

          </>
        )}

        <footer className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span>Legal</span>
          <Link
            href="/terms"
            className="font-semibold text-emerald-900 underline"
          >
            Terms of Service
          </Link>
          <span>|</span>
          <Link
            href="/privacy"
            className="font-semibold text-emerald-900 underline"
          >
            Privacy Policy
          </Link>
        </footer>
      </main>
    </div>
  );
}
