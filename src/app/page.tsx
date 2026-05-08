"use client";

import { getCurrentAuthUser, saveJourneyStateToPrefs, loadJourneyStateFromPrefs } from "@/lib/supabase-journey";
import { signOutCurrentUser } from "@/lib/supabase-journey";
import type { GoalSetup, JourneyState } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "quran-journeys-state";

const defaultGoal: GoalSetup = { goalType: "surah", target: "Surah Al-Baqarah", timePerDayMinutes: 15, language: "English", profileRole: "Developer" };

const journeyCards: Array<{ key: GoalSetup["goalType"]; title: string; subtitle: string; icon: string }> = [
  { key: "khatam", title: "Khatam Journey", subtitle: "Steady completion pace across your available daily time", icon: "📖" },
  { key: "surah", title: "Specific Surah", subtitle: "Deep focus on one surah with guided daily ayah ranges", icon: "🎯" },
  { key: "theme", title: "Theme Journey", subtitle: "Curated verses around patience, gratitude, rizq and more", icon: "💡" },
];

const KHATAM_OPTS = Array.from({ length: 30 }, (_, i) => `Juz ${i + 1}`);
const THEME_OPTS = ["Sabr (Patience)", "Rizq (Provision)", "Mercy", "Guidance", "Gratitude", "Stress and Ease"];
const SURAH_OPTS = ["Surah Al-Fatiha","Surah Al-Baqarah","Surah Aal-Imran","Surah An-Nisa","Surah Al-Ma'idah","Surah Al-An'am","Surah Al-A'raf","Surah Al-Anfal","Surah At-Tawbah","Surah Yunus","Surah Yusuf","Surah Ar-Rahman","Surah Al-Mulk","Surah Al-Kahf","Surah Ya-Sin","Surah As-Sajdah","Surah Al-Waqiah","Surah Al-Ikhlas","Surah Al-Falaq","Surah An-Nas"];

const features = [
  { icon: "📖", title: "Read", desc: "Arabic text, translation, and verse-by-verse audio from Quran.com" },
  { icon: "🧠", title: "Understand", desc: "AI explanations with professional analogies, plus classical tafsir" },
  { icon: "💭", title: "Reflect", desc: "Personalized prompts, mood tracking, and adaptive session pacing" },
  { icon: "📊", title: "Track", desc: "Streaks, weekly insights, and progress synced to Quran Foundation" },
];

export default function LandingPage() {
  const router = useRouter();
  const [goalForm, setGoalForm] = useState<GoalSetup>(defaultGoal);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [runtimeNotice, setRuntimeNotice] = useState("");

  const onboardingHint = useMemo(() => `Takes less than 30 seconds. Explanations will adapt for ${goalForm.profileRole}.`, [goalForm.profileRole]);

  const targetLabel = goalForm.goalType === "khatam" ? "Juz target" : goalForm.goalType === "theme" ? "Theme" : "Surah target";
  const targetOpts = goalForm.goalType === "khatam" ? KHATAM_OPTS : goalForm.goalType === "theme" ? THEME_OPTS : null;

  useEffect(() => {
    async function bootstrap() {
      let hasJourney = false;
      const localData = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (localData) hasJourney = true;
      const user = await getCurrentAuthUser();
      if (!hasJourney && user) {
        const remoteState = await loadJourneyStateFromPrefs();
        if (remoteState) hasJourney = true;
      }
      setAuthEmail(user?.email ?? null);
      setAuthChecked(true);
      if (hasJourney) router.push("/app");
    }
    void bootstrap();
  }, [router]);

  async function handleLogout() {
    try { await signOutCurrentUser(); setAuthEmail(null); } catch { setRuntimeNotice("Unable to log out right now."); }
  }

  async function startJourney() {
    if (typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY)) {
      setRuntimeNotice("You already have an active journey. Reset it from the dashboard first.");
      return;
    }
    setLoadingPlan(true); setRuntimeNotice("");
    try {
      const response = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(goalForm) });
      if (!response.ok) throw new Error("Unable to generate plan");
      const payload = (await response.json()) as { plan: JourneyState["plan"] };
      const nextState: JourneyState = { createdAt: new Date().toISOString(), goal: goalForm, plan: payload.plan, logs: [] };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
      try { const user = await getCurrentAuthUser(); if (user) await saveJourneyStateToPrefs(nextState); } catch { /* local still works */ }
      router.push("/app");
    } catch { setRuntimeNotice("Plan generation is temporarily unavailable. Please retry."); } finally { setLoadingPlan(false); }
  }

  return (
    <div className="relative text-slate-900">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8">

        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-emerald-900/15 bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-800 p-8 text-white shadow-2xl md:p-12">
          <div className="pointer-events-none absolute inset-0 opacity-10" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
          <div className="relative">
            <div className="inline-block rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200 backdrop-blur-sm border border-white/10 mb-4">
              ✨ AI-Powered Quran Coach
            </div>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl leading-[1.1]">
              Quran consistency<br />
              <span className="text-emerald-300">for busy schedules</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base text-emerald-100/90 md:text-lg leading-relaxed">
              Build a sustainable 10-20 minute daily rhythm with guided Read, Understand, Reflect sessions. Powered by Quran Foundation APIs and AI.
            </p>
            <div className="mt-7 flex flex-wrap gap-3 text-sm">
              {!authChecked ? (
                <span className="rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 font-semibold text-white animate-pulse">Checking session...</span>
              ) : authEmail ? (
                <>
                  <Link href="/app" className="rounded-xl bg-white px-5 py-2.5 font-semibold text-emerald-900 shadow-lg transition hover:bg-emerald-50 hover:shadow-xl">Open App Workspace →</Link>
                  <button type="button" onClick={() => void handleLogout()} className="rounded-xl border border-white/40 bg-transparent px-4 py-2.5 font-semibold text-white transition hover:bg-white/10">Log Out</button>
                </>
              ) : (
                <>
                  <Link href="/auth?mode=login&next=/app" className="rounded-xl bg-white px-5 py-2.5 font-semibold text-emerald-900 shadow-lg transition hover:bg-emerald-50 hover:shadow-xl">Log In</Link>
                  <Link href="/auth?mode=signup&next=/app" className="rounded-xl border border-white/40 bg-emerald-700/50 px-5 py-2.5 font-semibold text-white transition hover:bg-emerald-600/50 backdrop-blur-sm">Create Account</Link>
                  <a href="#setup" className="rounded-xl border border-white/30 bg-transparent px-5 py-2.5 font-semibold text-white transition hover:bg-white/10">Try as Guest ↓</a>
                </>
              )}
            </div>
            <p className="mt-4 text-xs text-emerald-200/80">
              {authEmail ? `Signed in as ${authEmail}` : "Guest mode available · No sign-up required"}
            </p>
          </div>
        </section>

        {/* Features grid */}
        <section className="grid gap-4 md:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="group rounded-2xl border border-emerald-900/10 bg-white/80 p-5 shadow-sm transition hover:shadow-md hover:-translate-y-0.5 backdrop-blur-sm">
              <span className="text-3xl mb-3 block">{f.icon}</span>
              <h3 className="text-base font-bold text-slate-900">{f.title}</h3>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </section>

        {/* Setup form */}
        <section id="setup" className="grid gap-6 rounded-3xl border border-emerald-900/15 bg-white/85 p-6 shadow-sm backdrop-blur-sm md:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Step 1</p>
            <h2 className="mt-1 text-2xl font-semibold">Choose your journey type</h2>
            <p className="mt-2 text-sm text-slate-600">{onboardingHint}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {journeyCards.map((card) => (
              <button key={card.key} type="button" onClick={() => setGoalForm((p) => ({ ...p, goalType: card.key, target: card.key === "khatam" ? "Juz 1" : card.key === "theme" ? "Sabr (Patience)" : "Surah Al-Baqarah" }))} className={`rounded-2xl border p-4 text-left transition-all ${goalForm.goalType === card.key ? "border-emerald-700 bg-emerald-50 shadow-sm ring-1 ring-emerald-700/20" : "border-slate-200 bg-white hover:border-emerald-300 hover:shadow-sm"}`}>
                <span className="text-2xl mb-2 block">{card.icon}</span>
                <p className="text-base font-semibold text-slate-900">{card.title}</p>
                <p className="mt-1 text-xs text-slate-600">{card.subtitle}</p>
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5 text-sm">
              <label htmlFor="target" className="font-semibold text-slate-700">Step 2: {targetLabel}</label>
              {targetOpts ? (
                <select id="target" className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none" value={goalForm.target} onChange={(e) => setGoalForm((p) => ({ ...p, target: e.target.value }))}>
                  {targetOpts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <>
                  <input id="target" className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none" value={goalForm.target} onChange={(e) => setGoalForm((p) => ({ ...p, target: e.target.value }))} placeholder="Choose a surah" list="surah-targets" />
                  <datalist id="surah-targets">{SURAH_OPTS.map((o) => <option key={o} value={o} />)}</datalist>
                </>
              )}
            </div>
            <div className="grid gap-1.5 text-sm">
              <label htmlFor="minutes" className="font-semibold text-slate-700">Daily minutes</label>
              <select id="minutes" className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none" value={goalForm.timePerDayMinutes} onChange={(e) => setGoalForm((p) => ({ ...p, timePerDayMinutes: Number(e.target.value) }))}>
                <option value={10}>10 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={20}>20 minutes</option>
              </select>
            </div>
            <div className="grid gap-1.5 text-sm">
              <label htmlFor="role" className="font-semibold text-slate-700">Role</label>
              <input id="role" className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none" value={goalForm.profileRole} onChange={(e) => setGoalForm((p) => ({ ...p, profileRole: e.target.value }))} placeholder="Developer, Founder, Student" />
            </div>
            <div className="grid gap-1.5 text-sm">
              <label htmlFor="language" className="font-semibold text-slate-700">Translation language</label>
              <select id="language" className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none" value={goalForm.language} onChange={(e) => setGoalForm((p) => ({ ...p, language: e.target.value }))}>
                <option value="English">English</option>
                <option value="Urdu">Urdu</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="Turkish">Turkish</option>
                <option value="Indonesian">Indonesian</option>
                <option value="Bangla">Bangla</option>
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-100/50 p-5">
            <p className="text-sm font-semibold text-emerald-900">Step 3: Start your journey</p>
            <p className="text-sm text-emerald-800 mt-1">Your personalized 7-day plan will be generated using live Quran Foundation APIs.</p>
            <button type="button" onClick={() => void startJourney()} disabled={loadingPlan} className="mt-4 rounded-xl bg-emerald-900 px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-emerald-800 hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60">
              {loadingPlan ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Generating plan...
                </span>
              ) : "Start my 7-day journey →"}
            </button>
          </div>

          {runtimeNotice && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{runtimeNotice}</p>}
        </section>

        {/* API usage badge */}
        <section className="rounded-2xl border border-emerald-900/10 bg-white/80 p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 mb-3">Powered by Quran Foundation APIs</p>
          <div className="flex flex-wrap justify-center gap-2 text-xs">
            {["Verses API", "Translation API", "Audio API", "Tafsir API", "OAuth2 OIDC", "Streak API", "Activity API", "Bookmarks API", "Reflections API"].map((api) => (
              <span key={api} className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 font-semibold text-emerald-800">{api}</span>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
