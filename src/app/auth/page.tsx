"use client";

import {
  saveJourneyStateToPrefs,
  signInWithEmail,
  signUpWithEmail,
} from "@/lib/supabase-journey";
import type { JourneyState } from "@/lib/types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

const STORAGE_KEY = "quran-journeys-state";

type AuthMode = "login" | "signup";

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-700">Loading...</div>}>
      <AuthPageContent />
    </Suspense>
  );
}

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const nextPath = searchParams.get("next") || "/";

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const demoEmail = process.env.NEXT_PUBLIC_DEMO_EMAIL || "";
  const demoPassword = process.env.NEXT_PUBLIC_DEMO_PASSWORD || "";
  const canUseDemo = Boolean(demoEmail && demoPassword);

  const pageTitle = useMemo(
    () => (mode === "login" ? "Welcome Back" : "Create Your Account"),
    [mode],
  );

  async function importLocalJourneyIfPresent() {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const localState = JSON.parse(raw) as JourneyState;
      await saveJourneyStateToPrefs(localState);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  async function handleSubmit() {
    setLoading(true);
    setError("");
    setInfo("");

    try {
      if (mode === "signup") {
        const result = await signUpWithEmail(email, password, name || "Reader");

        if (result.status === "confirmation_required") {
          setInfo(
            `Signup successful. Please confirm your email (${result.email}) from the message sent by Supabase, then log in.`,
          );
          setMode("login");
          return;
        }

        await importLocalJourneyIfPresent();
        router.push(nextPath);
        return;
      } else {
        await signInWithEmail(email, password);
      }

      await importLocalJourneyIfPresent();
      router.push(nextPath);
    } catch {
      setError("Unable to authenticate. Check credentials and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function loginAsDemo() {
    if (!canUseDemo) {
      return;
    }

    setLoading(true);
    setError("");
    setInfo("");

    try {
      await signInWithEmail(demoEmail, demoPassword);
      await importLocalJourneyIfPresent();
      router.push(nextPath);
    } catch {
      setError("Demo login is not configured or failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_#f7f1d8_0%,_#f8f4e8_35%,_#e8efe6_100%)] px-4 py-10 text-slate-900 md:px-8">
      <div className="pointer-events-none absolute inset-0 opacity-25 [background:linear-gradient(120deg,transparent_0%,rgba(13,95,78,0.08)_25%,transparent_55%),linear-gradient(0deg,rgba(189,147,69,0.06),rgba(189,147,69,0.06))]" />

      <main className="relative mx-auto grid w-full max-w-4xl gap-6 rounded-3xl border border-emerald-900/15 bg-white/80 p-6 backdrop-blur-md md:grid-cols-[1.1fr_1fr] md:p-8">
        <section className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-900/80">
            Quran Journeys
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{pageTitle}</h1>
          <p className="text-sm leading-7 text-slate-700">
            Keep your experience simple for judging: sign in for synced persistence,
            or return and continue as guest for instant walkthrough.
          </p>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold">Quick actions</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={loginAsDemo}
                disabled={!canUseDemo || loading}
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Use Demo Account
              </button>
              <Link
                href="/"
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Continue as Guest
              </Link>
            </div>
          </div>
        </section>

        <section className="grid content-start gap-4 rounded-2xl border border-emerald-900/10 bg-white p-4 md:p-5">
          <div className="flex gap-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 rounded-lg px-3 py-2 transition ${
                mode === "login" ? "bg-white text-slate-900" : "text-slate-600"
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-lg px-3 py-2 transition ${
                mode === "signup" ? "bg-white text-slate-900" : "text-slate-600"
              }`}
            >
              Sign Up
            </button>
          </div>

          <label className="grid gap-1 text-sm">
            Email
            <input
              type="email"
              autoComplete="email"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>

          {mode === "signup" ? (
            <label className="grid gap-1 text-sm">
              Display name
              <input
                autoComplete="name"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Amaan"
              />
            </label>
          ) : null}

          <label className="grid gap-1 text-sm">
            Password
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </label>

          {error ? <p className="text-xs text-rose-700">{error}</p> : null}
          {info ? <p className="text-xs text-emerald-700">{info}</p> : null}

          <button
            onClick={() => void handleSubmit()}
            disabled={loading || !email || !password}
            className="rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? mode === "login"
                ? "Logging in..."
                : "Creating account..."
              : mode === "login"
                ? "Log In"
                : "Create Account"}
          </button>

          <p className="text-xs text-slate-600">
            By continuing, you agree to our {" "}
            <Link href="/terms" className="font-semibold text-emerald-900 underline">
              Terms
            </Link>
            {" "}and{" "}
            <Link href="/privacy" className="font-semibold text-emerald-900 underline">
              Privacy Policy
            </Link>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
