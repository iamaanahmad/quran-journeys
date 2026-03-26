import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Quran Journeys",
  description:
    "Terms of Service for Quran Journeys, including acceptable use, data handling, and service limitations.",
};

const effectiveDate = "March 24, 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f7f1d8_0%,_#f8f4e8_35%,_#e8efe6_100%)] px-4 py-10 text-slate-900 md:px-8">
      <main className="mx-auto w-full max-w-4xl rounded-3xl border border-emerald-900/15 bg-white/85 p-6 shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-900/80">
          Legal
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-slate-600">Effective date: {effectiveDate}</p>

        <div className="mt-6 grid gap-6 text-sm leading-7 text-slate-700">
          <section>
            <h2 className="text-lg font-semibold text-slate-900">1. Service overview</h2>
            <p>
              Quran Journeys provides guided Quran reading sessions, reflection tools,
              and progress features intended for educational and spiritual support.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">2. Acceptable use</h2>
            <p>
              You agree to use the service lawfully and respectfully. You must not
              attempt to disrupt the platform, abuse API integrations, or use the
              product for unlawful activity.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">3. Accounts and security</h2>
            <p>
              You are responsible for keeping your account credentials secure and for
              activity that occurs under your account. If you suspect unauthorized
              access, contact the team immediately and reset your credentials.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">4. Content and API dependencies</h2>
            <p>
              Quran Journeys uses third-party services including Quran Foundation APIs
              and Supabase. Service quality may depend on these providers and network
              availability.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">5. Intellectual property</h2>
            <p>
              Application code, branding, and interface design are protected by
              applicable intellectual property laws. Quranic source content remains
              subject to its respective providers and licenses.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">6. No warranty</h2>
            <p>
              The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis without
              warranties of uninterrupted operation, fitness for a specific purpose,
              or error-free performance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">7. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, Quran Journeys and its
              contributors are not liable for indirect, incidental, or consequential
              damages arising from use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">8. Changes to terms</h2>
            <p>
              We may update these terms from time to time. Material updates will be
              reflected by a revised effective date.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">9. Contact</h2>
            <p>
              For legal or account questions, contact the project maintainers through
              the repository contact channel.
            </p>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap gap-3 text-sm">
          <Link
            href="/privacy"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Read Privacy Policy
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
