"use client";

import type { JourneyState, AppView, WeeklyInsight } from "./types";

export function DashboardView({
  state,
  streak,
  progress,
  completedDays,
  hasCompletedToday,
  currentDayIndex,
  onStartSession,
  onViewPlan,
  onResetJourney,
}: {
  state: JourneyState;
  streak: number;
  progress: number;
  completedDays: number;
  hasCompletedToday: boolean;
  currentDayIndex: number;
  onStartSession: () => void;
  onViewPlan: () => void;
  onResetJourney: () => void;
}) {
  return (
    <section className="rounded-3xl border border-emerald-900/15 bg-white/85 p-6 shadow-sm md:p-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold tracking-tight">Your Progress</h2>
          <p className="text-sm text-slate-600">
            Goal:{" "}
            <span className="font-semibold capitalize">{state.goal.goalType}</span> (
            {state.goal.timePerDayMinutes} min/day)
          </p>
        </div>
        <div className="flex flex-wrap justify-start md:justify-end gap-3">
          <StatCard label="Day Streak" value={streak} icon="🔥" />
          <StatCard label="Completed" value={`${progress}%`} icon="📊" />
          <StatCard label="Sessions" value={`${completedDays}/7`} icon="📖" />
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-6">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
          <span>Journey Progress</span>
          <span>{progress}%</span>
        </div>
        <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-1000 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Action card */}
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {completedDays >= state.plan.length ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
              🎉
            </div>
            <h3 className="text-xl font-bold text-emerald-900">Alhamdulillah!</h3>
            <p className="mt-2 text-sm text-slate-600">
              You have completed your entire 7-day journey plan.
            </p>
            <button
              onClick={onResetJourney}
              className="mt-5 rounded-xl bg-emerald-900 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-800 transition"
            >
              Start a New Journey
            </button>
          </div>
        ) : hasCompletedToday ? (
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
              ✅
            </div>
            <h3 className="text-xl font-bold text-emerald-900">Session Completed</h3>
            <p className="mt-2 text-slate-600 max-w-md">
              Great job maintaining your habit today! Your next session awaits tomorrow
              for Day {currentDayIndex}.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={onViewPlan}
                className="rounded-xl bg-emerald-900 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-emerald-800 transition"
              >
                View Plan
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl animate-pulse">
              📖
            </div>
            <h3 className="text-2xl font-bold text-emerald-900">
              Ready for Day {currentDayIndex}?
            </h3>
            <p className="mt-2 text-sm text-slate-600 max-w-sm">
              Take {state.goal.timePerDayMinutes} minutes out of your busy day to
              reconnect and reflect.
            </p>
            <button
              onClick={onStartSession}
              className="mt-6 rounded-xl bg-emerald-900 px-8 py-4 text-base font-bold text-white shadow-md hover:bg-emerald-800 hover:-translate-y-0.5 hover:shadow-lg transition-all"
            >
              Start Today&apos;s Session
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 px-5 py-3 md:px-6 min-w-[90px]">
      <span className="text-lg mb-0.5">{icon}</span>
      <span className="text-2xl md:text-3xl font-bold text-emerald-900">{value}</span>
      <span className="text-[10px] md:text-xs font-semibold uppercase tracking-widest text-emerald-700">
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan View
// ---------------------------------------------------------------------------

export function PlanView({ state }: { state: JourneyState }) {
  return (
    <section className="rounded-3xl border border-emerald-900/15 bg-white/85 p-6 shadow-sm md:p-8 animate-in fade-in duration-500">
      <h2 className="text-2xl font-semibold">7-Day Plan</h2>
      <p className="mt-2 text-sm text-slate-600">
        Your structured journey with completion status and ayah ranges.
      </p>
      <div className="mt-5 grid gap-3">
        {state.plan.map((day) => (
          <article
            key={day.dayIndex}
            className={`rounded-xl border p-4 transition-all ${
              day.completed
                ? "border-emerald-200 bg-emerald-50/50"
                : "border-slate-200 bg-white hover:shadow-sm"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                    day.completed
                      ? "bg-emerald-900 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {day.completed ? "✓" : day.dayIndex}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Day {day.dayIndex} • {day.fromAyahKey} – {day.toAyahKey}
                  </p>
                  <p className="text-xs text-slate-500">
                    {day.date} • ~{day.estimatedMinutes} min • {day.verses.length} verses
                  </p>
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  day.completed
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-amber-100 text-amber-900"
                }`}
              >
                {day.completed ? "Completed" : "Upcoming"}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Insights View
// ---------------------------------------------------------------------------

export function InsightsView({
  weeklyInsight,
  streak,
  progress,
  onCopyWeeklySummary,
}: {
  weeklyInsight: WeeklyInsight;
  streak: number;
  progress: number;
  onCopyWeeklySummary: () => void;
}) {
  return (
    <section className="grid gap-4 rounded-2xl border border-emerald-900/15 bg-white/85 p-5 md:grid-cols-[1.2fr_1fr] animate-in fade-in duration-500">
      <article className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600 mb-4">
          📊 Weekly Insight
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <InsightStat label="Sessions" value={`${weeklyInsight.completedSessions}/7`} />
          <InsightStat label="Minutes" value={weeklyInsight.totalMinutes} />
          <InsightStat label="Top Mood" value={weeklyInsight.topMood} />
          <InsightStat label="Avg Clarity" value={weeklyInsight.averageClarity} />
          <InsightStat
            label="Consistency"
            value={`${weeklyInsight.consistencyScore}/100`}
            className="col-span-2"
          />
        </div>
        <button
          onClick={onCopyWeeklySummary}
          className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          📋 Copy Weekly Summary
        </button>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600 mb-3">
          🤝 Share Your Progress
        </h3>
        <p className="text-sm text-slate-700 leading-relaxed">
          Keep yourself accountable by sharing your progress with friends and family.
        </p>
        <button
          type="button"
          onClick={() => {
            const siteUrl = typeof window !== "undefined" ? window.location.origin : "https://quranjourneys.netlify.app";
            const shareText = `I just completed a session on Quran Journeys! I'm on a ${streak}-day streak and have finished ${progress}% of my goal. Join me: ${siteUrl}`;
            navigator.clipboard.writeText(shareText);
          }}
          className="mt-4 rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
        >
          📋 Copy Share Link
        </button>
      </article>
    </section>
  );
}

function InsightStat({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className={`rounded-lg bg-slate-50 p-3 ${className}`}>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="text-lg font-bold text-slate-900 capitalize">{value}</p>
    </div>
  );
}
