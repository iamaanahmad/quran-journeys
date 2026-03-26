"use client";

import { getCurrentAuthUser, saveJourneyStateToPrefs } from "@/lib/supabase-journey";
import { signOutCurrentUser } from "@/lib/supabase-journey";
import type { GoalSetup, JourneyState } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "quran-journeys-state";

const defaultGoal: GoalSetup = {
  goalType: "surah",
  target: "Surah Al-Baqarah",
  timePerDayMinutes: 15,
  language: "English",
  profileRole: "Developer",
};

const journeyCards: Array<{
  key: GoalSetup["goalType"];
  title: string;
  subtitle: string;
}> = [
  {
    key: "khatam",
    title: "Khatam Journey",
    subtitle: "Steady completion pace across your available daily time",
  },
  {
    key: "surah",
    title: "Specific Surah",
    subtitle: "Deep focus on one surah with guided daily ayah ranges",
  },
  {
    key: "theme",
    title: "Theme Journey",
    subtitle: "Curated verses around patience, gratitude, rizq and more",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [goalForm, setGoalForm] = useState<GoalSetup>(defaultGoal);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [runtimeNotice, setRuntimeNotice] = useState("");

  const onboardingHint = useMemo(() => {
    return `Takes less than 30 seconds. Explanations will adapt for ${goalForm.profileRole}.`;
  }, [goalForm.profileRole]);

  useEffect(() => {
    async function bootstrap() {
      const user = await getCurrentAuthUser();
      setAuthEmail(user?.email ?? null);
      setAuthChecked(true);
    }

    void bootstrap();
  }, []);

  async function handleLogout() {
    try {
      await signOutCurrentUser();
      setAuthEmail(null);
    } catch {
      setRuntimeNotice("Unable to log out right now. Please try again.");
    }
  }

  async function startJourney() {
    setLoadingPlan(true);
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
      };

      const nextState: JourneyState = {
        createdAt: new Date().toISOString(),
        goal: goalForm,
        plan: payload.plan,
        logs: [],
      };

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));

      try {
        const user = await getCurrentAuthUser();
        if (user) {
          await saveJourneyStateToPrefs(nextState);
        }
      } catch {
        // Local storage still lets users continue if remote persistence is unavailable.
      }

      router.push("/app");
    } catch {
      setRuntimeNotice(
        "Plan generation is temporarily unavailable. Please retry in a moment.",
      );
    } finally {
      setLoadingPlan(false);
    }
  }

  return (
    <div className="relative text-slate-900">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="rounded-3xl border border-emerald-900/15 bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-700 p-6 text-white shadow-xl md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-100/80">
            Quran Journeys
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-5xl">
            Quran consistency for busy schedules
          </h1>
          <p className="mt-4 max-w-3xl text-sm text-emerald-50 md:text-base">
            Build a sustainable 10-20 minute daily rhythm with guided Read,
            Understand, Reflect sessions and adaptive pacing.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            {!authChecked ? (
              <span className="rounded-xl border border-white/30 bg-white/10 px-4 py-2 font-semibold text-white">
                Checking session...
              </span>
            ) : authEmail ? (
              <>
                <Link
                  href="/app"
                  className="rounded-xl bg-white px-4 py-2 font-semibold text-emerald-900 transition hover:bg-emerald-50"
                >
                  Open App Workspace
                </Link>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="rounded-xl border border-white/40 bg-transparent px-4 py-2 font-semibold text-white transition hover:bg-white/10"
                >
                  Log Out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth?mode=login&next=/app"
                  className="rounded-xl bg-white px-4 py-2 font-semibold text-emerald-900 transition hover:bg-emerald-50"
                >
                  Log In
                </Link>
                <Link
                  href="/auth?mode=signup&next=/app"
                  className="rounded-xl border border-white/40 bg-emerald-700 px-4 py-2 font-semibold text-white transition hover:bg-emerald-600"
                >
                  Create Account
                </Link>
                <Link
                  href="/app"
                  className="rounded-xl border border-white/40 bg-transparent px-4 py-2 font-semibold text-white transition hover:bg-white/10"
                >
                  Open App Workspace
                </Link>
              </>
            )}
          </div>
          <p className="mt-4 text-xs text-emerald-100">
            {authEmail
              ? `Signed in as ${authEmail}. Your plan will sync when generated.`
              : "Guest mode is available. Sign in for synced persistence across devices."}
          </p>
        </section>

        <section className="grid gap-6 rounded-3xl border border-emerald-900/15 bg-white/85 p-6 shadow-sm md:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Step 1
            </p>
            <h2 className="mt-1 text-2xl font-semibold">Choose your journey type</h2>
            <p className="mt-2 text-sm text-slate-600">{onboardingHint}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {journeyCards.map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() =>
                  setGoalForm((previous) => ({
                    ...previous,
                    goalType: card.key,
                    target:
                      card.key === "khatam"
                        ? "Juz 1"
                        : card.key === "theme"
                          ? "Sabr (Patience)"
                          : previous.target,
                  }))
                }
                className={`rounded-2xl border p-4 text-left transition ${
                  goalForm.goalType === card.key
                    ? "border-emerald-700 bg-emerald-50"
                    : "border-slate-200 bg-white hover:border-emerald-300"
                }`}
              >
                <p className="text-base font-semibold text-slate-900">{card.title}</p>
                <p className="mt-1 text-xs text-slate-600">{card.subtitle}</p>
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1 text-sm">
              <label htmlFor="target" className="font-semibold text-slate-700">
                Step 2: Target
              </label>
              <input
                id="target"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                value={goalForm.target}
                onChange={(event) =>
                  setGoalForm((previous) => ({
                    ...previous,
                    target: event.target.value,
                  }))
                }
                placeholder="Surah Al-Baqarah / Sabr / Juz 1"
              />
            </div>

            <div className="grid gap-1 text-sm">
              <label htmlFor="minutes" className="font-semibold text-slate-700">
                Daily minutes
              </label>
              <select
                id="minutes"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                value={goalForm.timePerDayMinutes}
                onChange={(event) =>
                  setGoalForm((previous) => ({
                    ...previous,
                    timePerDayMinutes: Number(event.target.value),
                  }))
                }
              >
                <option value={10}>10 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={20}>20 minutes</option>
              </select>
            </div>

            <div className="grid gap-1 text-sm">
              <label htmlFor="role" className="font-semibold text-slate-700">
                Role
              </label>
              <input
                id="role"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                value={goalForm.profileRole}
                onChange={(event) =>
                  setGoalForm((previous) => ({
                    ...previous,
                    profileRole: event.target.value,
                  }))
                }
              />
            </div>

            <div className="grid gap-1 text-sm">
              <label htmlFor="language" className="font-semibold text-slate-700">
                Language
              </label>
              <input
                id="language"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                value={goalForm.language}
                onChange={(event) =>
                  setGoalForm((previous) => ({
                    ...previous,
                    language: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900">Step 3</p>
            <p className="text-sm text-emerald-800">
              Start your 7-day journey now. You can adjust target and pace anytime.
            </p>
            <button
              type="button"
              onClick={() => void startJourney()}
              disabled={loadingPlan}
              className="mt-3 rounded-xl bg-emerald-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingPlan ? "Generating plan..." : "Start my 7-day journey"}
            </button>
          </div>

          {runtimeNotice ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {runtimeNotice}
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
