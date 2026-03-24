import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Quran Journeys",
  description:
    "Privacy Policy for Quran Journeys, describing collected data, purpose, retention, and user choices.",
};

const effectiveDate = "March 24, 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f7f1d8_0%,_#f8f4e8_35%,_#e8efe6_100%)] px-4 py-10 text-slate-900 md:px-8">
      <main className="mx-auto w-full max-w-4xl rounded-3xl border border-emerald-900/15 bg-white/85 p-6 shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-900/80">
          Legal
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-slate-600">Effective date: {effectiveDate}</p>

        <div className="mt-6 grid gap-6 text-sm leading-7 text-slate-700">
          <section>
            <h2 className="text-lg font-semibold text-slate-900">1. Information we collect</h2>
            <p>
              We collect account information (such as email and display name), usage
              data needed to provide guided sessions, and optional reflections you
              write in the app.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">2. How we use data</h2>
            <p>
              Data is used to authenticate users, persist journeys, personalize
              recommendations, and improve reliability. We do not sell personal data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">3. Storage and processors</h2>
            <p>
              Quran Journeys uses Supabase for authentication and persistence and may
              call Quran Foundation APIs to fetch Quran content and user-linked
              features where authorized.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">4. Retention</h2>
            <p>
              We retain data for as long as your account remains active or as needed
              to operate the service. You may request deletion of your data through
              project maintainers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">5. Security</h2>
            <p>
              We apply reasonable technical safeguards, but no online system can
              guarantee absolute security. Keep your credentials confidential.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">6. Your choices</h2>
            <p>
              You can use guest mode, sign out at any time, and request account/data
              deletion. Some features may be limited when third-party APIs are
              unavailable or permission-restricted.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">7. Policy updates</h2>
            <p>
              We may update this policy to reflect product or legal changes. Updates
              are reflected by the effective date above.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">8. Contact</h2>
            <p>
              For privacy requests, contact the project maintainers through the
              repository contact channel.
            </p>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap gap-3 text-sm">
          <Link
            href="/terms"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Read Terms of Service
          </Link>
          <Link
            href="/"
            className="rounded-xl bg-emerald-900 px-4 py-2 font-semibold text-white transition hover:bg-emerald-800"
          >
            Back to App
          </Link>
        </div>
      </main>
    </div>
  );
}
