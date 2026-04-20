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

const moodOptions: MoodTag[] = [
  "calm",
  "hopeful",
  "anxious",
  "grateful",
  "focused",
  "tired",
];

interface WeeklyInsight {
  totalMinutes: number;
  completedSessions: number;
  topMood: MoodTag | "none";
  averageClarity: number;
  consistencyScore: number;
}

type SessionStep = "read" | "understand" | "reflect";
type AppView = "dashboard" | "session" | "plan" | "insights";

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function calculateStreak(logs: SessionLog[]): number {
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
  const [state, setState] = useState<JourneyState | null>(null);
  const [step, setStep] = useState<SessionStep>("read");
  const [appView, setAppView] = useState<AppView>("dashboard");
  const [highContrast, setHighContrast] = useState(false);
  const [fontSize, setFontSize] = useState<"base" | "large" | "xlarge">("base");
  const [loadingExplain, setLoadingExplain] = useState(false);
  const [explanation, setExplanation] = useState<ExplanationResult | null>(null);
  const [reflectionText, setReflectionText] = useState("");
  const [moodTag, setMoodTag] = useState<MoodTag>("calm");
  const [lengthRating, setLengthRating] = useState<LengthRating>("ok");
  const [clarityRating, setClarityRating] = useState(4);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [syncState, setSyncState] = useState<{
    source: "supabase" | "local" | "not-synced";
    message: string;
  }>({
    source: "not-synced",
    message: "Not synced yet",
  });
const [circleMembers, setCircleMembers] = useState<string[]>([]);
  const [newCircleMember, setNewCircleMember] = useState("");
  const [tourDismissed, setTourDismissed] = useState(false);
  const [runtimeNotice, setRuntimeNotice] = useState("");
  const [sessionFeedbackMessage, setSessionFeedbackMessage] = useState("");
  const [qfSession, setQfSession] = useState<{
    connected: boolean;
    expiresAt: number | null;
  }>({
    connected: false,
    expiresAt: null,
  });

  const updateSyncState = useCallback(
    (next: {
      source: "supabase" | "local" | "not-synced";
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
    const handlePlay = (e: Event) => {
      const audios = document.getElementsByTagName('audio');
      for (let i = 0; i < audios.length; i++) {
        if (audios[i] !== e.target) {
          audios[i].pause();
        }
      }
    };
    document.addEventListener('play', handlePlay, true);
    return () => document.removeEventListener('play', handlePlay, true);
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

  const hasCompletedToday = useMemo(() => {
    const todayStr = toDateOnly(new Date());
    return state?.logs.some(log => log.date === todayStr && log.completed) ?? false;
  }, [state]);

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

  const refreshQfSessionStatus = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/qf-auth/session", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`QF session check failed (${response.status})`);
      }
      const payload = (await response.json()) as { connected: boolean; expiresAt: number | null };
      setQfSession({
        connected: Boolean(payload.connected),
        expiresAt: payload.expiresAt ?? null,
      });
    } catch {
      setQfSession({ connected: false, expiresAt: null });
    }
  }, []);

  const connectQfAccount = useCallback(() => {
    window.location.assign("/api/qf-auth/start?next=/app");
  }, []);

  const disconnectQfAccount = useCallback(async () => {
    const response = await fetch("/api/qf-auth/logout", { method: "POST" });
    if (!response.ok) {
      throw new Error("Unable to disconnect Quran account");
    }
    await refreshQfSessionStatus();
  }, [refreshQfSessionStatus]);

  const refreshUserProgressStatus = useCallback(async (userId: string): Promise<void> => {
    try {
      const response = await fetch(`/api/user-progress?userId=${encodeURIComponent(userId)}`);

      if (!response.ok) {
        throw new Error(`User API status check failed: ${response.status}`);
      }

      const payload = (await response.json()) as UserProgressSyncResponse;
    } catch (error) {
      console.warn("User progress refresh fallback to local", error);
    }
  }, []);

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
        headers: {
          "Content-Type": "application/json",
          "x-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Failed to sync user progress (${response.status})`);
      }

      const result = (await response.json()) as UserProgressSyncResponse;
    } catch (error) {
      console.warn("User progress sync fallback to local", error);
    }
  }, []);

  useEffect(() => {
    void refreshQfSessionStatus();

    const params = new URLSearchParams(window.location.search);
    const qf = params.get("qf");
    const qfMessage = params.get("message");

    if (qf === "connected") {
      setRuntimeNotice("Quran account connected. User APIs are now available.");
      params.delete("qf");
      params.delete("message");
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    } else if (qf === "error") {
      setRuntimeNotice(
        `Quran account connection failed${qfMessage ? `: ${qfMessage}` : ""}`,
      );
      params.delete("qf");
      params.delete("message");
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, [refreshQfSessionStatus]);

  useEffect(() => {
    async function bootstrap() {
      const localRaw = window.localStorage.getItem(STORAGE_KEY);
      const currentUser = await getCurrentAuthUser();
      if (currentUser) {
        setAuthUser(currentUser);
        updateSyncState({
          source: "supabase",
          message: "Connected to Supabase. Progress synced to your account.",
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
            source: "local",
            message: "Progress tracked locally. Sign in to sync across devices.",
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
      await fetch("/api/qf-auth/logout", { method: "POST" });
    } finally {
      setAuthUser(null);
      setQfSession({ connected: false, expiresAt: null });
      updateSyncState({
        source: "local",
        message: "Logged out. Progress tracked locally.",
      });
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
    setAppView("dashboard");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetJourney() {
    const isConfirmed = window.confirm("Are you sure you want to reset your journey? All progress and settings will be removed.");
    if (!isConfirmed) {
      return;
    }
    window.localStorage.removeItem(STORAGE_KEY);
    if (authUser) {
      void clearJourneyStateFromPrefs();
    }
    setState(null);
    setExplanation(null);
    setReflectionText("");
    setStep("read");
  }

  const baseFontClasses =
    fontSize === "xlarge"
      ? "text-xl md:text-2xl"
      : fontSize === "large"
        ? "text-lg md:text-xl"
        : "text-base";

  return (
    <div className={`relative min-h-screen overflow-x-hidden transition-colors ${highContrast ? "bg-black text-white" : "bg-[radial-gradient(circle_at_top,_#f7f1d8_0%,_#f8f4e8_35%,_#e8efe6_100%)] text-slate-900"}`}>
      {!highContrast && <div className="pointer-events-none absolute inset-0 opacity-25 [background:linear-gradient(120deg,transparent_0%,rgba(13,95,78,0.08)_25%,transparent_55%),linear-gradient(0deg,rgba(189,147,69,0.06),rgba(189,147,69,0.06))]" />}

      <main className={`relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8 ${baseFontClasses}`}>
        <header className={`rounded-3xl border p-6 backdrop-blur-md md:p-8 ${highContrast ? "bg-black border-white/20" : "bg-white/75 border-emerald-900/15"}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-[0.25em] ${highContrast ? "text-gray-400" : "text-emerald-900/80"}`}>
                App Workspace
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
                Quran Journeys Dashboard
              </h1>
              <p className={`mt-3 max-w-3xl text-sm md:text-base ${highContrast ? "text-gray-300" : "text-slate-700"}`}>
                Track your live journey with panel-based navigation for Dashboard,
                Today&apos;s Session, Plan, and Insights.
              </p>
            </div>
            
            <div className="flex items-center gap-2 rounded-xl bg-slate-900/5 dark:bg-white/10 p-1">
              <button
                title="Toggle High Contrast"
                onClick={() => setHighContrast(prev => !prev)}
                className={`p-2 rounded-lg transition ${highContrast ? "bg-white text-black" : "hover:bg-slate-200 text-slate-700"}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </button>
              <div className="w-[1px] h-6 bg-slate-300 dark:bg-slate-700 mx-1"></div>
              <button
                title="Normal Font Size"
                onClick={() => setFontSize("base")}
                className={`p-2 rounded-lg font-bold text-sm transition ${fontSize === "base" ? "bg-emerald-900 text-white" : highContrast ? "hover:bg-white/20 text-white" : "hover:bg-slate-200 text-slate-700"}`}
              >
                A
              </button>
              <button
                title="Large Font Size"
                onClick={() => setFontSize("large")}
                className={`p-2 rounded-lg font-bold text-base transition ${fontSize === "large" ? "bg-emerald-900 text-white" : highContrast ? "hover:bg-white/20 text-white" : "hover:bg-slate-200 text-slate-700"}`}
              >
                A+
              </button>
              <button
                title="Extra Large Font Size"
                onClick={() => setFontSize("xlarge")}
                className={`p-2 rounded-lg font-bold text-lg transition ${fontSize === "xlarge" ? "bg-emerald-900 text-white" : highContrast ? "hover:bg-white/20 text-white" : "hover:bg-slate-200 text-slate-700"}`}
              >
                A++
              </button>
            </div>
          </div>

          {runtimeNotice ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {runtimeNotice}
            </p>
          ) : null}

          <div className="mt-6 grid gap-3 rounded-2xl border border-emerald-900/10 bg-white/80 p-4">
            {authUser ? (
              <div className="grid w-full gap-3">
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
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-slate-600">
                    Quran account: {qfSession.connected ? "Connected" : "Not connected"}
                    {qfSession.connected && qfSession.expiresAt
                      ? ` (expires ${new Date(qfSession.expiresAt).toLocaleString()})`
                      : ""}
                  </p>
                  {qfSession.connected ? (
                    <button
                      type="button"
                      onClick={() => void disconnectQfAccount()}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Disconnect Quran Account
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={connectQfAccount}
                      className="rounded-xl bg-emerald-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-800"
                    >
                      Connect Quran Account
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/auth?mode=login&next=/app"
                  className="rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
                >
                  Log In
                </Link>
                <Link
                  href="/auth?mode=signup&next=/app"
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
              Progress sync: {syncState.message}
              {authUser ? ` (${authUser.id})` : ""}
            </p>
          </div>
        </header>

        {!state ? (
          <section className="rounded-3xl border border-emerald-900/15 bg-white/90 p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold">No active journey yet</h2>
            <p className="mt-2 text-sm text-slate-600">
              Start from onboarding to generate your personalized 7-day plan, then
              return here for your full app workspace.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link
                href="/"
                className="rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
              >
                Open Onboarding
              </Link>
              <Link
                href="/auth?mode=login&next=/app"
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Log In
              </Link>
            </div>
          </section>
        ) : (
          <>
            {sessionFeedbackMessage ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-sm flex justify-between items-center">
                <span>{sessionFeedbackMessage}</span>
                <button onClick={() => setSessionFeedbackMessage("")} className="text-emerald-700 hover:text-emerald-900 text-xs uppercase tracking-widest font-bold">Dismiss</button>
              </div>
            ) : null}
            <section className="rounded-2xl border border-emerald-900/15 bg-white/85 p-3">
              <div className="flex flex-wrap gap-2">
                {([
                  ["dashboard", "Dashboard"],
                  ["session", "Today\'s Session"],
                  ["plan", "Plan"],
                  ["insights", "Circles / Insights"],
                ] as Array<[AppView, string]>).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAppView(key)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      appView === key
                        ? "bg-emerald-900 text-white"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            

            <section className={`${appView === "dashboard" ? "block" : "hidden"} rounded-3xl border border-emerald-900/15 bg-white/85 p-6 shadow-sm md:p-8`}>
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div className="flex flex-col gap-2">
                  <h2 className="text-2xl font-bold tracking-tight">Your Progress</h2>
                  <p className="text-sm text-slate-600">
                    Goal: <span className="font-semibold capitalize">{state.goal.goalType}</span> ({state.goal.timePerDayMinutes} min/day)
                  </p>
                </div>
                <div className="flex flex-wrap justify-start md:justify-end gap-3">
                  <div className="flex flex-col items-center justify-center rounded-2xl bg-emerald-50 px-5 py-3 md:px-6">
                    <span className="text-2xl md:text-3xl font-bold text-emerald-900">{streak}</span>
                    <span className="text-[10px] md:text-xs font-semibold uppercase tracking-widest text-emerald-700">Day Streak</span>
                  </div>
                  <div className="flex flex-col items-center justify-center rounded-2xl bg-emerald-50 px-5 py-3 md:px-6">
                    <span className="text-2xl md:text-3xl font-bold text-emerald-900">{progress}%</span>
                    <span className="text-[10px] md:text-xs font-semibold uppercase tracking-widest text-emerald-700">Completed</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                {completedDays >= state.plan.length ? (
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-emerald-900">Alhamdulillah!</h3>
                    <p className="mt-2 text-sm text-slate-600">You have completed your entire 7-day journey plan.</p>
                    <button onClick={resetJourney} className="mt-5 rounded-xl bg-emerald-900 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-800 transition">
                      Start a New Journey
                    </button>
                  </div>
                ) : hasCompletedToday ? (
                  <div className="flex flex-col items-center text-center">
                    <div className="bg-emerald-100 text-emerald-800 p-4 rounded-full mb-3">
                      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-emerald-900">Session Completed</h3>
                    <p className="mt-2 text-slate-600 max-w-md">Great job maintaining your habit today! Your next session awaits tomorrow for Day {currentDay?.dayIndex ?? completedDays + 1}.</p>
                    <div className="mt-5 flex gap-3">
                      <button onClick={() => setAppView("plan")} className="rounded-xl bg-emerald-900 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-emerald-800 transition">
                        View Plan
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center">
                    <h3 className="text-2xl font-bold text-emerald-900">Ready for Day {currentDay?.dayIndex ?? completedDays + 1}?</h3>
                    <p className="mt-2 text-sm text-slate-600 max-w-sm">Take {state.goal.timePerDayMinutes} minutes out of your busy day to reconnect and reflect.</p>
                    <button onClick={() => setAppView("session")} className="mt-6 rounded-xl bg-emerald-900 px-8 py-4 text-base font-bold text-white shadow-md hover:bg-emerald-800 hover:-translate-y-0.5 hover:shadow-lg transition">
                      Start Today&apos;s Session
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section className={`${appView === "insights" ? "grid" : "hidden"} gap-4 rounded-2xl border border-emerald-900/15 bg-white/85 p-4 md:grid-cols-[1.2fr_1fr]`}>
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
                  Share Your Progress
                </h3>
                <div className="mt-2 grid gap-2 text-sm text-slate-700">
                  <p>
                    Finished your daily session? Keep yourself accountable by sharing your progress with friends and family.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const shareText = `I just completed a session on Quran Journeys! I'm on a ${streak}-day streak and have finished ${progress}% of my goal. Join me: https://quranjourneys.app`;
                      navigator.clipboard.writeText(shareText);
                      alert("Progress copied to clipboard!");
                    }}
                    className="mt-3 rounded-lg bg-emerald-900 px-4 py-2 font-semibold text-white transition hover:bg-emerald-800"
                  >
                    Copy Share Link
                  </button>
                </div>
              </article>
            </section>

            {appView === "plan" ? (
              <section className="rounded-3xl border border-emerald-900/15 bg-white/85 p-6 shadow-sm md:p-8">
                <h2 className="text-2xl font-semibold">7-Day Plan</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Structured plan view with completion status and ayah ranges.
                </p>
                <div className="mt-4 grid gap-3">
                  {state.plan.map((day) => (
                    <article
                      key={day.dayIndex}
                      className="rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800">
                          Day {day.dayIndex} • {day.fromAyahKey} - {day.toAyahKey}
                        </p>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            day.completed
                              ? "bg-emerald-100 text-emerald-900"
                              : "bg-amber-100 text-amber-900"
                          }`}
                        >
                          {day.completed ? "Completed" : "Upcoming"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{day.date} • ~{day.estimatedMinutes} min</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : hasCompletedToday && appView === "session" ? (
              <section className="rounded-3xl border border-emerald-900/15 bg-white/85 p-8 text-center shadow-sm">
                <div className="mx-auto flex w-16 h-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 mb-4">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-emerald-900">Done for Today</h2>
                <p className="mt-2 text-slate-600">
                  You&apos;ve completed today&apos;s session! Return tomorrow for your next verses. 
                  Building a habit requires patience, not just speed.
                </p>
                <div className="mt-6 flex justify-center gap-4">
                  <button onClick={() => setAppView("dashboard")} className="rounded-xl bg-emerald-900 px-6 py-3 font-semibold text-white shadow hover:bg-emerald-800 transition">Go to Dashboard</button>
                  <button onClick={() => setAppView("plan")} className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 shadow hover:bg-slate-50 transition">View Plan</button>
                </div>
              </section>
            ) : currentDay && appView === "session" ? (
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
                          <audio controls controlsList="nodownload" preload="none" className="h-8 w-64 md:w-80">
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
                              href={`https://quran.com/${verse.key.replace(":", "/")}?translations=85`}
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
                  </div>
                )}
              </section>
            ) : appView === "session" ? (
              <section className="rounded-3xl border border-emerald-900/15 bg-white/85 p-8 text-center">
                <h2 className="text-2xl font-semibold">7-Day Plan Complete</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Great consistency. Start a fresh journey to continue building
                  your Quran habit.
                </p>
              </section>
            ) : null}

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

      </main>
    </div>
  );
}



