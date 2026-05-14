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

function toAuthErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("email not confirmed") ||
    normalized.includes("email_not_confirmed") ||
    normalized.includes("confirm your email")
  ) {
    return "Your email is not confirmed yet. Please use the confirmation link from your inbox, then log in.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "Invalid email or password. Please try again.";
  }

  if (normalized.includes("too many requests")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  return "Unable to authenticate. Check credentials and try again.";
}

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
    } catch (error) {
      setError(toAuthErrorMessage(error));
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
    <div className="flex min-h-[calc(100vh-180px)] items-center justify-center py-4">
      <main className="mx-auto grid w-full max-w-lg gap-8 md:max-w-4xl md:grid-cols-[1.1fr_1fr] md:gap-6">
        <section className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-900/80">
              Quran Journeys
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">{pageTitle}</h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Sign in for synced persistence, or continue as guest for an instant walkthrough.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 backdrop-blur-sm">
            <p className="text-sm font-semibold">Quick actions</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
              <button
                onClick={loginAsDemo}
                disabled={!canUseDemo || loading}
                className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
              >
                Use Demo Account
              </button>
              <Link
                href="/"
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Continue as Guest
              </Link>
            </div>
          </div>
        </section>

        <section className="grid content-start gap-4 rounded-2xl border border-emerald-900/10 bg-white/80 p-5 backdrop-blur-sm md:p-6">
          <div className="flex gap-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 rounded-lg px-3 py-2.5 transition ${
                mode === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-lg px-3 py-2.5 transition ${
                mode === "signup" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              Sign Up
            </button>
          </div>

          <label className="grid gap-1.5 text-sm font-medium">
            Email
            <input
              type="email"
              autoComplete="email"
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>

          {mode === "signup" ? (
            <label className="grid gap-1.5 text-sm font-medium">
              Display name
              <input
                autoComplete="name"
                className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Amaan"
              />
            </label>
          ) : null}

          <label className="grid gap-1.5 text-sm font-medium">
            Password
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
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
            className="rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? mode === "login"
                ? "Logging in..."
                : "Creating account..."
              : mode === "login"
                ? "Log In"
                : "Create Account"}
          </button>

          <p className="text-xs text-slate-500">
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
