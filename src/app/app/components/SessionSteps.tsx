"use client";

import type { SessionPlanDay, ExplanationResult, VerseItem, TafsirItem, MoodTag, LengthRating } from "./types";
import { useState } from "react";

// ---------------------------------------------------------------------------
// Verse Card — now with bookmark button
// ---------------------------------------------------------------------------

export function VerseCard({
  verse,
  highContrast,
  arabicFontClass,
  translationFontClass,
  qfConnected,
}: {
  verse: VerseItem;
  highContrast: boolean;
  arabicFontClass: string;
  translationFontClass: string;
  qfConnected?: boolean;
}) {
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [bookmarkMsg, setBookmarkMsg] = useState("");

  const cardBg = highContrast
    ? "bg-zinc-900 border-zinc-700 text-white"
    : "bg-white border-slate-200";
  const muted = highContrast ? "text-zinc-400" : "text-slate-500";
  const regular = highContrast ? "text-zinc-300" : "text-slate-700";

  async function toggleBookmark() {
    setBookmarkLoading(true);
    setBookmarkMsg("");
    try {
      if (bookmarked) {
        const r = await fetch(`/api/bookmarks?key=${encodeURIComponent(verse.key)}`, { method: "DELETE" });
        const d = await r.json();
        if (d.ok) { setBookmarked(false); setBookmarkMsg("Bookmark removed"); }
        else setBookmarkMsg(d.error ?? "Failed to remove");
      } else {
        const r = await fetch("/api/bookmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: verse.key }),
        });
        const d = await r.json();
        if (d.ok) { setBookmarked(true); setBookmarkMsg("Bookmarked to Quran.com!"); }
        else setBookmarkMsg(d.error ?? "Failed to bookmark");
      }
    } catch { setBookmarkMsg("Could not connect"); }
    finally {
      setBookmarkLoading(false);
      setTimeout(() => setBookmarkMsg(""), 3000);
    }
  }

  return (
    <article className={`rounded-2xl border p-5 transition-all hover:shadow-md ${cardBg}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-[10px] md:text-xs font-semibold tracking-[0.12em] ${muted}`}>
          {verse.key}
        </p>
        <div className="flex items-center gap-2">
          {qfConnected && (
            <button
              type="button"
              onClick={() => void toggleBookmark()}
              disabled={bookmarkLoading}
              title={bookmarked ? "Remove bookmark" : "Bookmark to Quran.com"}
              className={`rounded-lg px-2 py-1.5 text-sm transition-all disabled:opacity-50 ${
                bookmarked
                  ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                  : highContrast
                    ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-amber-400"
                    : "bg-slate-50 text-slate-400 hover:bg-amber-50 hover:text-amber-600"
              }`}
            >
              {bookmarkLoading ? "…" : bookmarked ? "🔖" : "🏷️"}
            </button>
          )}
          <audio controls controlsList="nodownload" preload="none" className="h-8 w-44 md:w-80">
            <source src={verse.audioUrl} type="audio/mpeg" />
          </audio>
        </div>
      </div>
      {bookmarkMsg && (
        <p className={`mt-2 text-xs font-medium ${bookmarked ? "text-amber-600" : "text-slate-500"}`}>
          {bookmarkMsg}
        </p>
      )}
      <p
        className={`arabic mt-4 md:mt-6 text-right ${arabicFontClass} ${highContrast ? "text-emerald-100/90" : "text-emerald-950"} tracking-wide`}
        dir="rtl"
        translate="no"
      >
        {verse.arabic}
      </p>
      <p className={`mt-4 md:mt-5 ${translationFontClass} ${regular} tracking-wide leading-relaxed`}>
        {verse.translation}
      </p>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Read Step
// ---------------------------------------------------------------------------

export function ReadStep({
  currentDay,
  highContrast,
  arabicFontClass,
  translationFontClass,
  loadingExplain,
  onContinue,
  qfConnected,
}: {
  currentDay: SessionPlanDay;
  highContrast: boolean;
  arabicFontClass: string;
  translationFontClass: string;
  loadingExplain: boolean;
  onContinue: () => void;
  qfConnected?: boolean;
}) {
  return (
    <div className="grid gap-4">
      {currentDay.verses.map((verse) => (
        <VerseCard
          key={verse.key}
          verse={verse}
          highContrast={highContrast}
          arabicFontClass={arabicFontClass}
          translationFontClass={translationFontClass}
          qfConnected={qfConnected}
        />
      ))}
      <button
        onClick={onContinue}
        disabled={loadingExplain}
        className="justify-self-start rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-500 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loadingExplain ? (
          <span className="flex items-center gap-2">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Generating explanation...
          </span>
        ) : (
          "Continue to Understand →"
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Understand Step
// ---------------------------------------------------------------------------

export function UnderstandStep({
  explanation,
  currentDay,
  tafsirs,
  loadingTafsir,
  highContrast,
  translationFontClass,
  onContinue,
  onLoadTafsir,
}: {
  explanation: ExplanationResult | null;
  currentDay: SessionPlanDay;
  tafsirs: TafsirItem[];
  loadingTafsir: boolean;
  highContrast: boolean;
  translationFontClass: string;
  onContinue: () => void;
  onLoadTafsir: () => void;
}) {
  const bg = highContrast
    ? "bg-zinc-800 border-zinc-600 text-white"
    : "bg-amber-50/70 border-amber-200 text-slate-900";
  const regular = highContrast ? "text-zinc-300" : "text-slate-700";

  return (
    <div className={`grid gap-5 rounded-2xl border p-5 md:p-6 ${bg}`}>
      {explanation ? (
        <>
          <h3 className="text-lg md:text-xl font-bold tracking-tight">Key Points</h3>
          <ul className={`grid gap-3 ${translationFontClass} ${regular} tracking-wide`}>
            {explanation.keyPoints.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-0.5 text-amber-500 font-bold text-lg">•</span>
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>

          <h4 className="mt-2 text-base md:text-lg font-bold tracking-tight">In Simple Terms</h4>
          <p className={`${translationFontClass} ${regular} tracking-wide leading-relaxed`}>
            {explanation.simpleSummary}
          </p>

          {/* Tafsir Section */}
          {tafsirs.length > 0 && (
            <div className={`mt-2 rounded-xl border p-4 ${highContrast ? "bg-zinc-900 border-zinc-700" : "bg-white/80 border-amber-200"}`}>
              <h4 className="text-sm font-bold uppercase tracking-widest text-amber-600 mb-3">
                📖 Classical Tafsir
              </h4>
              {tafsirs.map((t) => (
                <div key={t.verseKey} className="mb-3 last:mb-0">
                  <p className={`text-xs font-semibold ${highContrast ? "text-zinc-400" : "text-slate-500"}`}>
                    {t.verseKey} — {t.resourceName}
                  </p>
                  <p className={`mt-1 text-sm leading-relaxed ${regular} line-clamp-4`}>
                    {t.text}
                  </p>
                </div>
              ))}
            </div>
          )}

          {tafsirs.length === 0 && (
            <button
              type="button"
              onClick={onLoadTafsir}
              disabled={loadingTafsir}
              className={`justify-self-start rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                highContrast
                  ? "border-amber-700 bg-zinc-900 text-amber-400 hover:bg-zinc-800"
                  : "border-amber-300 bg-white text-amber-800 hover:bg-amber-50"
              } disabled:opacity-50`}
            >
              {loadingTafsir ? "Loading tafsir..." : "📖 Load Classical Tafsir (Ibn Kathir)"}
            </button>
          )}

          <p
            className={`mt-2 rounded-xl px-4 py-3 text-xs md:text-sm font-medium ${
              highContrast
                ? "bg-amber-950/40 text-amber-200 border border-amber-900/50"
                : "bg-amber-100 text-amber-900"
            }`}
          >
            {explanation.disclaimer}
          </p>

          {/* Source links */}
          <div className="flex flex-wrap gap-2 text-xs">
            {currentDay.verses.slice(0, 3).map((verse) => (
              <a
                key={verse.key}
                href={`https://quran.com/${verse.key.replace(":", "/")}?translations=85`}
                target="_blank"
                rel="noreferrer"
                className={`rounded-full border px-4 py-2 font-semibold transition ${
                  highContrast
                    ? "border-amber-700 bg-black text-amber-500 hover:bg-zinc-900"
                    : "border-amber-300 bg-white text-amber-900 hover:bg-amber-50"
                }`}
              >
                See source {verse.key} ↗
              </a>
            ))}
          </div>

          <button
            onClick={onContinue}
            className="justify-self-start rounded-xl bg-emerald-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 hover:shadow-md"
          >
            Continue to Reflect →
          </button>
        </>
      ) : (
        <p className="text-sm text-slate-700">
          Generate explanation from the Read step first.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reflect Step — now with "Post Reflection" to Quran Foundation
// ---------------------------------------------------------------------------

const moodEmoji: Record<MoodTag, string> = {
  calm: "😌",
  hopeful: "🤲",
  anxious: "😰",
  grateful: "🙏",
  focused: "🎯",
  tired: "😴",
};

const moodOptions: MoodTag[] = ["calm", "hopeful", "anxious", "grateful", "focused", "tired"];

export function ReflectStep({
  explanation,
  highContrast,
  translationFontClass,
  onComplete,
  qfConnected,
  currentDay,
}: {
  explanation: ExplanationResult | null;
  highContrast: boolean;
  translationFontClass: string;
  onComplete: (data: {
    reflectionText: string;
    moodTag: MoodTag;
    lengthRating: LengthRating;
    clarityRating: number;
  }) => void;
  qfConnected?: boolean;
  currentDay?: SessionPlanDay;
}) {
  const [reflectionText, setReflectionText] = useState("");
  const [moodTag, setMoodTag] = useState<MoodTag>("calm");
  const [lengthRating, setLengthRating] = useState<LengthRating>("ok");
  const [clarityRating, setClarityRating] = useState(4);
  const [postToQf, setPostToQf] = useState(false);
  const [postingReflection, setPostingReflection] = useState(false);
  const [postMsg, setPostMsg] = useState("");

  const regular = highContrast ? "text-zinc-300" : "text-slate-700";
  const inputBg = highContrast
    ? "bg-black border-zinc-700 text-white"
    : "bg-white border-slate-300 text-slate-800";

  async function handleComplete() {
    // Optionally post reflection to QF before completing
    if (postToQf && reflectionText.trim() && qfConnected) {
      setPostingReflection(true);
      try {
        const verseKey = currentDay?.verses?.[0]?.key;
        const r = await fetch("/api/reflections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: reflectionText.trim(),
            verseKey,
          }),
        });
        const d = await r.json();
        if (d.ok) {
          setPostMsg("Reflection shared to Quran.com! ✨");
        } else {
          setPostMsg(d.error ?? "Could not share reflection");
        }
      } catch {
        setPostMsg("Could not connect to Quran Foundation");
      } finally {
        setPostingReflection(false);
      }
    }

    onComplete({ reflectionText, moodTag, lengthRating, clarityRating });
  }

  return (
    <div
      className={`grid gap-5 rounded-2xl border p-5 md:p-6 ${
        highContrast
          ? "bg-emerald-950/40 border-emerald-900/60"
          : "bg-emerald-50/60 border-emerald-200"
      }`}
    >
      <h3 className="text-lg md:text-xl font-bold tracking-tight">Reflection & Feedback</h3>

      {explanation?.reflectionPrompts?.length ? (
        <ul className={`grid gap-3 ${translationFontClass} ${regular} tracking-wide`}>
          {explanation.reflectionPrompts.map((prompt) => (
            <li key={prompt} className="flex gap-3">
              <span className="mt-0.5 text-emerald-500 font-bold text-lg">•</span>
              <span className="leading-relaxed">{prompt}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <label className={`grid gap-2 ${translationFontClass} ${regular} font-medium mt-2`}>
        Short reflection note
        <textarea
          rows={4}
          className={`rounded-xl border px-4 py-3 placeholder:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 ${inputBg}`}
          value={reflectionText}
          onChange={(e) => setReflectionText(e.target.value)}
          placeholder="What stood out? What will you apply today?"
        />
      </label>

      {/* Post to QF option */}
      {qfConnected && (
        <label className={`flex items-center gap-3 text-sm font-medium ${regular} cursor-pointer`}>
          <input
            type="checkbox"
            checked={postToQf}
            onChange={(e) => setPostToQf(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span>Share this reflection to Quran.com</span>
          <span className="text-xs text-slate-400">(visible on your QF profile)</span>
        </label>
      )}

      {postMsg && (
        <p className={`text-xs font-medium ${postMsg.includes("✨") ? "text-emerald-600" : "text-amber-600"}`}>
          {postMsg}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3 mt-1">
        {/* Mood tag with emoji buttons */}
        <div className={`grid gap-2 ${regular} font-medium`}>
          <span className="text-sm">How do you feel?</span>
          <div className="flex flex-wrap gap-1.5">
            {moodOptions.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMoodTag(m)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  moodTag === m
                    ? "bg-emerald-900 text-white shadow-sm"
                    : highContrast
                      ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {moodEmoji[m]} {m}
              </button>
            ))}
          </div>
        </div>

        <label className={`grid gap-2 ${regular} font-medium`}>
          <span className="text-sm">Session length felt</span>
          <select
            className={`rounded-xl border px-4 py-3 appearance-none transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 ${inputBg}`}
            value={lengthRating}
            onChange={(e) => setLengthRating(e.target.value as LengthRating)}
          >
            <option value="too_short">Too short</option>
            <option value="ok">Just right</option>
            <option value="too_long">Too long</option>
          </select>
        </label>

        {/* Star rating for clarity */}
        <div className={`grid gap-2 ${regular} font-medium`}>
          <span className="text-sm">Clarity rating</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setClarityRating(star)}
                className={`text-2xl transition-transform hover:scale-110 ${
                  star <= clarityRating ? "text-amber-500" : highContrast ? "text-zinc-700" : "text-slate-300"
                }`}
              >
                ★
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={() => void handleComplete()}
        disabled={postingReflection}
        className="justify-self-start rounded-xl bg-emerald-900 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-emerald-800 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {postingReflection ? (
          <span className="flex items-center gap-2">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Sharing reflection...
          </span>
        ) : (
          "✓ Complete Session"
        )}
      </button>
    </div>
  );
}
