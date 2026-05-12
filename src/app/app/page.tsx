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
  SessionLog,
  UserProgressSyncRequest,
  UserProgressSyncResponse,
} from "@/lib/types";
import type { TafsirItem, SessionStep, AppView } from "./components/types";
import {
  toDateOnly,
  calculateStreak,
  calculateMonthMinutes,
  calculateTotalMinutes,
  buildWeeklyInsight,
  addReviewVerseToPlan,
} from "./components/utils";
import { ReadStep, UnderstandStep, ReflectStep } from "./components/SessionSteps";
import { DashboardView, PlanView, InsightsView } from "./components/DashboardViews";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "quran-journeys-state";
const USER_PROGRESS_ID_KEY = "quran-journeys-progress-user-id";

export default function AppPage() {
  const [state, setState] = useState<JourneyState | null>(null);
  const [step, setStep] = useState<SessionStep>("read");
  const [appView, setAppView] = useState<AppView>("dashboard");
  const [highContrast, setHighContrast] = useState(false);
  const [fontSize, setFontSize] = useState<"base" | "large" | "xlarge">("base");
  const [loadingExplain, setLoadingExplain] = useState(false);
  const [explanation, setExplanation] = useState<ExplanationResult | null>(null);
  const [tafsirs, setTafsirs] = useState<TafsirItem[]>([]);
  const [loadingTafsir, setLoadingTafsir] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [syncMsg, setSyncMsg] = useState("Not synced yet");
  const [runtimeNotice, setRuntimeNotice] = useState("");
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [qfConnected, setQfConnected] = useState(false);
  const [qfExpiry, setQfExpiry] = useState<number | null>(null);

  // --- Derived state ---
  const currentDay = useMemo(() => {
    if (!state?.plan.length) return null;
    return state.plan.find((d) => !d.completed) ?? null;
  }, [state]);

  const completedDays = useMemo(() => state?.plan.filter((d) => d.completed).length ?? 0, [state]);
  const progress = state?.plan.length ? Math.round((completedDays / state.plan.length) * 100) : 0;
  const streak = useMemo(() => (state ? calculateStreak(state.logs) : 0), [state]);
  const weeklyInsight = useMemo(() => buildWeeklyInsight(state?.logs ?? []), [state]);
  const hasCompletedToday = useMemo(() => {
    const today = toDateOnly(new Date());
    return state?.logs.some((l) => l.date === today && l.completed) ?? false;
  }, [state]);

  // --- Font classes ---
  const baseFontClasses = fontSize === "xlarge" ? "text-xl md:text-2xl" : fontSize === "large" ? "text-lg md:text-xl" : "text-base";
  const arabicFontClass = fontSize === "xlarge" ? "text-4xl md:text-5xl leading-loose" : fontSize === "large" ? "text-3xl md:text-4xl leading-loose" : "text-2xl md:text-3xl leading-relaxed";
  const translationFontClass = fontSize === "xlarge" ? "text-lg md:text-xl leading-9" : fontSize === "large" ? "text-base md:text-lg leading-8" : "text-sm leading-7";

  // --- Persistence ---
  useEffect(() => {
    if (!state) return;
    if (authUser) { void saveJourneyStateToPrefs(state); return; }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, authUser]);

  // --- Audio management ---
  useEffect(() => {
    const handler = (e: Event) => {
      const audios = document.getElementsByTagName("audio");
      for (let i = 0; i < audios.length; i++) {
        if (audios[i] !== e.target) audios[i].pause();
      }
    };
    document.addEventListener("play", handler, true);
    return () => document.removeEventListener("play", handler, true);
  }, []);

  // --- User progress sync ---
  const getProgressUserId = useCallback((user: AuthUser | null): string => {
    if (user?.id) return user.id;
    const existing = window.localStorage.getItem(USER_PROGRESS_ID_KEY);
    if (existing) return existing;
    const id = `guest-${crypto.randomUUID?.() ?? Date.now()}`;
    window.localStorage.setItem(USER_PROGRESS_ID_KEY, id);
    return id;
  }, []);

  const syncUserProgress = useCallback(async (js: JourneyState, userId: string) => {
    const logs = js.logs.filter((l) => l.completed);
    const latestDay = [...js.plan].filter((d) => d.completed).sort((a, b) => b.dayIndex - a.dayIndex)[0];
    const payload: UserProgressSyncRequest = {
      userId,
      streakDays: calculateStreak(logs),
      completedSessions: logs.length,
      minutesThisMonth: calculateMonthMinutes(logs),
      totalMinutes: calculateTotalMinutes(logs),
      lastSessionDate: logs.length > 0 ? logs.map((l) => l.date).sort((a, b) => b.localeCompare(a))[0] : null,
      lastReadAyahKey: latestDay?.toAyahKey ?? js.plan[0]?.fromAyahKey ?? null,
    };
    try {
      await fetch("/api/user-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone },
        body: JSON.stringify(payload),
      });
    } catch { /* local fallback */ }
  }, []);

  // --- QF session ---
  const refreshQf = useCallback(async () => {
    try {
      const r = await fetch("/api/qf-auth/session", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as {
        connected: boolean;
        expiresAt: number | null;
        hasRefreshToken?: boolean;
        needsRefresh?: boolean;
      };
      setQfConnected(Boolean(d.connected));
      setQfExpiry(d.expiresAt ?? null);

      // Auto-refresh if token is near expiry and we have a refresh token
      if (d.needsRefresh) {
        try {
          const rr = await fetch("/api/qf-auth/refresh", { method: "POST" });
          if (rr.ok) {
            const rd = (await rr.json()) as { ok: boolean; expiresAt?: number };
            if (rd.ok) {
              setQfConnected(true);
              setQfExpiry(rd.expiresAt ?? null);
            }
          }
        } catch { /* refresh failed, keep current state */ }
      }
    } catch {
      setQfConnected(false);
      setQfExpiry(null);
    }
  }, []);

  // --- Bootstrap ---
  useEffect(() => {
    void refreshQf();
    // Periodically check and refresh QF token (every 1 min to catch 5-min expiries)
    const interval = setInterval(() => void refreshQf(), 1 * 60 * 1000);
    const p = new URLSearchParams(window.location.search);
    if (p.get("qf") === "connected") {
      setRuntimeNotice("Quran account connected. User APIs are now available.");
      p.delete("qf"); p.delete("message");
      window.history.replaceState({}, "", `${window.location.pathname}${p.toString() ? `?${p}` : ""}`);
    } else if (p.get("qf") === "error") {
      setRuntimeNotice(`Quran account connection failed${p.get("message") ? `: ${p.get("message")}` : ""}`);
      p.delete("qf"); p.delete("message");
      window.history.replaceState({}, "", `${window.location.pathname}${p.toString() ? `?${p}` : ""}`);
    }
    return () => clearInterval(interval);
  }, [refreshQf]);

  useEffect(() => {
    async function boot() {
      const localRaw = window.localStorage.getItem(STORAGE_KEY);
      const user = await getCurrentAuthUser();
      if (user) {
        setAuthUser(user);
        setSyncMsg("Connected to Supabase. Progress synced.");
        const remote = await loadJourneyStateFromPrefs();
        if (remote) { setState(remote); return; }
        if (localRaw) {
          try {
            const ls = JSON.parse(localRaw) as JourneyState;
            await saveJourneyStateToPrefs(ls);
            setState(ls);
            await syncUserProgress(ls, user.id);
            return;
          } catch { window.localStorage.removeItem(STORAGE_KEY); }
        }
      }
      if (localRaw) {
        try {
          const ls = JSON.parse(localRaw) as JourneyState;
          setState(ls);
          setSyncMsg("Progress tracked locally. Sign in to sync.");
          return;
        } catch { window.localStorage.removeItem(STORAGE_KEY); }
      }
      window.location.replace("/");
    }
    void boot();
  }, [syncUserProgress]);

  // --- Actions ---
  async function handleLogout() {
    try { await signOutCurrentUser(); await fetch("/api/qf-auth/logout", { method: "POST" }); } finally {
      setAuthUser(null); setQfConnected(false); setQfExpiry(null);
      setSyncMsg("Logged out. Progress tracked locally.");
    }
  }

  async function generateExplain() {
    if (!currentDay) return;
    setLoadingExplain(true); setRuntimeNotice("");
    try {
      const r = await fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verses: currentDay.verses }) });
      if (!r.ok) throw new Error();
      setExplanation((await r.json()) as ExplanationResult);
      setStep("understand");
    } catch { setRuntimeNotice("Explain API is slow. Retry in a moment."); } finally { setLoadingExplain(false); }
  }

  async function loadTafsir() {
    if (!currentDay) return;
    setLoadingTafsir(true);
    try {
      const r = await fetch("/api/tafsir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verses: currentDay.verses }) });
      if (r.ok) { const d = (await r.json()) as { tafsirs: TafsirItem[] }; setTafsirs(d.tafsirs); }
    } catch { /* silent */ } finally { setLoadingTafsir(false); }
  }

  function completeSession(data: { reflectionText: string; moodTag: string; lengthRating: string; clarityRating: number }) {
    if (!state || !currentDay) return;
    const updatedPlan = state.plan.map((d) => d.dayIndex === currentDay.dayIndex ? { ...d, completed: true } : d);
    const adaptedPlan = adjustRemainingPlan(updatedPlan, data.lengthRating as "too_short" | "ok" | "too_long");
    const log: SessionLog = { date: toDateOnly(new Date()), completed: true, lengthRating: data.lengthRating as "too_short" | "ok" | "too_long", clarityRating: data.clarityRating, moodTag: data.moodTag as SessionLog["moodTag"], reflectionText: data.reflectionText.trim(), minutesSpent: currentDay.estimatedMinutes };
    const reviewVerse = data.clarityRating <= 2 || data.moodTag === "anxious" || data.moodTag === "tired" ? currentDay.verses[0] : null;
    const finalPlan = reviewVerse ? addReviewVerseToPlan(adaptedPlan, reviewVerse) : adaptedPlan;
    const msg = data.lengthRating === "too_long" ? "Tomorrow will be shorter" : data.lengthRating === "too_short" ? "Tomorrow will be slightly longer" : "Tomorrow keeps similar length";
    const nextState: JourneyState = { ...state, plan: finalPlan, logs: [...state.logs, log] };
    setState(nextState);
    void syncUserProgress(nextState, getProgressUserId(authUser));
    setFeedbackMsg(`Got it. ${msg}${reviewVerse ? ` and includes review of ${reviewVerse.key}` : ""}.`);
    setExplanation(null); setTafsirs([]); setStep("read"); setAppView("dashboard");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetJourney() {
    if (!window.confirm("Are you sure? All progress will be removed.")) return;
    window.localStorage.removeItem(STORAGE_KEY);
    if (authUser) void clearJourneyStateFromPrefs();
    setState(null); setExplanation(null); setTafsirs([]); setStep("read");
  }

  async function copyWeeklySummary() {
    const s = [`Quran Journeys Weekly Insight`, `Sessions: ${weeklyInsight.completedSessions}/7`, `Minutes: ${weeklyInsight.totalMinutes}`, `Top mood: ${weeklyInsight.topMood}`, `Clarity: ${weeklyInsight.averageClarity}`, `Consistency: ${weeklyInsight.consistencyScore}/100`, `Streak: ${streak} days`].join("\n");
    try { await navigator.clipboard.writeText(s); } catch { /* no-op */ }
  }

  // --- Nav tabs ---
  const tabs: [AppView, string][] = [["dashboard", "Dashboard"], ["session", "Today's Session"], ["plan", "Plan"], ["insights", "Insights"]];

  return (
    <>
      {highContrast && <style dangerouslySetInnerHTML={{ __html: `body{background:black!important;color:white!important}` }} />}
      <div className={`relative transition-colors ${highContrast ? "bg-black text-white" : "text-slate-900"}`}>
        <main className={`relative mx-auto flex w-full max-w-6xl flex-col gap-5 ${baseFontClasses}`}>

          {/* Header */}
          <header className={`rounded-3xl border p-5 backdrop-blur-md md:p-6 ${highContrast ? "bg-black border-white/20" : "bg-white/75 border-emerald-900/15"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className={`text-[10px] font-semibold uppercase tracking-[0.25em] ${highContrast ? "text-gray-400" : "text-emerald-900/80"}`}>App Workspace</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Quran Journeys</h1>
              </div>
              <div className="flex items-center gap-1.5 rounded-xl bg-slate-900/5 p-1">
                <button title="Toggle High Contrast" onClick={() => setHighContrast((p) => !p)} className={`p-2 rounded-lg transition ${highContrast ? "bg-white text-black" : "hover:bg-slate-200 text-slate-700"}`}>
                  <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                </button>
                <div className="w-px h-5 bg-slate-300" />
                {(["base", "large", "xlarge"] as const).map((s) => (
                  <button key={s} onClick={() => setFontSize(s)} className={`p-1.5 md:p-2 rounded-lg font-bold text-xs md:text-sm transition ${fontSize === s ? "bg-emerald-900 text-white" : highContrast ? "hover:bg-white/20 text-white" : "hover:bg-slate-200 text-slate-700"}`}>
                    {s === "base" ? "A" : s === "large" ? "A+" : "A++"}
                  </button>
                ))}
              </div>
            </div>
            {runtimeNotice && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{runtimeNotice}</p>}

            {/* Auth info — inline, no nested card */}
            <div className={`mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 ${highContrast ? "border-white/10" : "border-slate-200/80"}`}>
              {authUser ? (
                <>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <p className="text-sm text-slate-700">Signed in as <span className="font-semibold">{authUser.name}</span></p>
                    <p className="text-xs text-slate-500">Quran.com: {qfConnected ? "Connected" : "Not connected"}{qfConnected && qfExpiry ? ` · expires ${new Date(qfExpiry).toLocaleDateString()} ${new Date(qfExpiry).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ""}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {qfConnected ? (
                      <button type="button" onClick={async () => { await fetch("/api/qf-auth/logout", { method: "POST" }); await refreshQf(); }} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">Disconnect QF</button>
                    ) : (
                      <button type="button" onClick={() => window.location.assign("/api/qf-auth/start?next=/app")} className="rounded-lg bg-emerald-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-800">Connect Quran</button>
                    )}
                    <button onClick={() => void handleLogout()} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">Log Out</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-500">Guest mode · {syncMsg}</p>
                  <div className="flex items-center gap-2">
                    <Link href="/auth?mode=login&next=/app" className="rounded-lg bg-emerald-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-800">Log In</Link>
                    <Link href="/auth?mode=signup&next=/app" className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500">Sign Up</Link>
                  </div>
                </>
              )}
            </div>
          </header>

          {!state ? (
            <section className="rounded-3xl border border-emerald-900/15 bg-white/90 p-8 shadow-sm">
              {/* Loading skeleton */}
              <div className="animate-pulse space-y-4">
                <div className="mx-auto h-6 w-48 rounded-lg bg-slate-200" />
                <div className="mx-auto h-4 w-64 rounded-lg bg-slate-100" />
                <div className="flex justify-center gap-4 mt-6">
                  <div className="h-20 w-28 rounded-2xl bg-emerald-100" />
                  <div className="h-20 w-28 rounded-2xl bg-emerald-100" />
                  <div className="h-20 w-28 rounded-2xl bg-emerald-100" />
                </div>
                <div className="h-3 w-full rounded-full bg-slate-100 mt-6" />
                <div className="h-24 w-full rounded-2xl bg-slate-50 mt-4" />
              </div>
              <noscript>
                <div className="text-center mt-4">
                  <h2 className="text-2xl font-semibold">No active journey</h2>
                  <p className="mt-2 text-sm text-slate-600">Start from onboarding to generate your personalized 7-day plan.</p>
                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    <Link href="/" className="rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800">Open Onboarding</Link>
                  </div>
                </div>
              </noscript>
            </section>
          ) : (
            <>
              {feedbackMsg && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-sm flex justify-between items-center">
                  <span>{feedbackMsg}</span>
                  <button onClick={() => setFeedbackMsg("")} className="text-emerald-700 hover:text-emerald-900 text-xs uppercase tracking-widest font-bold">Dismiss</button>
                </div>
              )}

              {/* Nav tabs */}
              <nav className="rounded-2xl border border-emerald-900/15 bg-white/85 p-2">
                <div className="flex flex-wrap gap-2">
                  {tabs.map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setAppView(key)} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${appView === key ? "bg-emerald-900 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>{label}</button>
                  ))}
                </div>
              </nav>

              {/* Views */}
              {appView === "dashboard" && (
                <DashboardView state={state} streak={streak} progress={progress} completedDays={completedDays} hasCompletedToday={hasCompletedToday} currentDayIndex={currentDay?.dayIndex ?? completedDays + 1} onStartSession={() => setAppView("session")} onViewPlan={() => setAppView("plan")} onResetJourney={resetJourney} />
              )}

              {appView === "plan" && <PlanView state={state} />}

              {appView === "insights" && (
                <InsightsView weeklyInsight={weeklyInsight} streak={streak} progress={progress} onCopyWeeklySummary={() => void copyWeeklySummary()} />
              )}

              {appView === "session" && hasCompletedToday && (
                <section className="rounded-3xl border border-emerald-900/15 bg-white/85 p-8 text-center shadow-sm">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✅</div>
                  <h2 className="text-2xl font-bold text-emerald-900">Done for Today</h2>
                  <p className="mt-2 text-slate-600">Return tomorrow for your next verses.</p>
                  <div className="mt-6 flex justify-center gap-4">
                    <button onClick={() => setAppView("dashboard")} className="rounded-xl bg-emerald-900 px-6 py-3 font-semibold text-white shadow hover:bg-emerald-800 transition">Dashboard</button>
                    <button onClick={() => setAppView("plan")} className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 shadow hover:bg-slate-50 transition">View Plan</button>
                  </div>
                </section>
              )}

              {appView === "session" && !hasCompletedToday && currentDay && (
                <div className="grid gap-5">
                  {/* Session header bar */}
                  <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 backdrop-blur-sm md:px-6 ${highContrast ? "bg-zinc-900 border-zinc-700" : "bg-white/70 border-emerald-900/10"}`}>
                    <h2 className="text-xl font-semibold md:text-2xl">Day {currentDay.dayIndex}: {currentDay.fromAyahKey} – {currentDay.toAyahKey}</h2>
                    <p className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">~{currentDay.estimatedMinutes} min</p>
                  </div>

                  {/* Step tabs */}
                  <div className="flex gap-2 text-xs font-semibold uppercase tracking-[0.15em]">
                    {(["read", "understand", "reflect"] as SessionStep[]).map((s) => (
                      <button key={s} onClick={() => setStep(s)} className={`rounded-full px-4 py-2 transition ${step === s ? "bg-emerald-900 text-white shadow-sm" : highContrast ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "bg-white/80 text-slate-600 border border-slate-200 hover:bg-white"}`}>{s}</button>
                    ))}
                  </div>

                  {/* Step content — no outer card wrapper */}
                  {step === "read" && <ReadStep currentDay={currentDay} highContrast={highContrast} arabicFontClass={arabicFontClass} translationFontClass={translationFontClass} loadingExplain={loadingExplain} onContinue={() => void generateExplain()} qfConnected={qfConnected} />}
                  {step === "understand" && <UnderstandStep explanation={explanation} currentDay={currentDay} tafsirs={tafsirs} loadingTafsir={loadingTafsir} highContrast={highContrast} translationFontClass={translationFontClass} onContinue={() => setStep("reflect")} onLoadTafsir={() => void loadTafsir()} />}
                  {step === "reflect" && <ReflectStep explanation={explanation} highContrast={highContrast} translationFontClass={translationFontClass} onComplete={completeSession} qfConnected={qfConnected} currentDay={currentDay} />}
                </div>
              )}

              {appView === "session" && !hasCompletedToday && !currentDay && (
                <section className="rounded-3xl border border-emerald-900/15 bg-white/85 p-8 text-center">
                  <h2 className="text-2xl font-semibold">7-Day Plan Complete</h2>
                  <p className="mt-2 text-sm text-slate-600">Start a fresh journey to continue.</p>
                </section>
              )}

              <div className="flex flex-wrap gap-3">
                <button onClick={resetJourney} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Reset Journey</button>
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}
