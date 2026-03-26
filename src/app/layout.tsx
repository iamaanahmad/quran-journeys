import type { Metadata } from "next";
import { Manrope, Noto_Naskh_Arabic } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const naskh = Noto_Naskh_Arabic({
  variable: "--font-naskh",
  subsets: ["arabic"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "Quran Journeys for Busy Professionals",
  description:
    "AI-assisted Quran coach with daily Read, Understand, Reflect sessions for busy professionals.",
  icons: {
    icon: "/qjlogo.png",
    shortcut: "/qjlogo.png",
    apple: "/qjlogo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${naskh.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[radial-gradient(circle_at_top,_#f7f1d8_0%,_#f8f4e8_35%,_#e8efe6_100%)] text-slate-900">
        <div className="pointer-events-none fixed inset-0 opacity-20 [background:linear-gradient(120deg,transparent_0%,rgba(13,95,78,0.08)_25%,transparent_55%),linear-gradient(0deg,rgba(189,147,69,0.06),rgba(189,147,69,0.06))]" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 md:px-8">
          <header className="sticky top-3 z-50 mt-3 rounded-2xl border border-emerald-900/15 bg-white/75 backdrop-blur-md">
            <div className="flex items-center justify-center px-4 py-3 md:px-5">
              <Link href="/" className="flex items-center gap-2">
                <Image
                  src="/qjlogo.png"
                  alt="Quran Journeys logo"
                  width={30}
                  height={30}
                  className="rounded-md"
                />
                <span className="text-sm font-semibold text-slate-900 md:text-base">
                  Quran Journeys
                </span>
              </Link>
            </div>
          </header>

          <div className="flex-1 py-6">{children}</div>

          <footer className="mb-4 mt-auto rounded-2xl border border-emerald-900/15 bg-white/70 px-4 py-3 text-xs text-slate-600 backdrop-blur-md md:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>
                Quran Journeys • Built for consistent daily Quran engagement.
              </p>
              <div className="flex items-center gap-3">
                <Link href="/terms" className="font-semibold text-emerald-900 underline">
                  Terms of Service
                </Link>
                <Link href="/privacy" className="font-semibold text-emerald-900 underline">
                  Privacy Policy
                </Link>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
