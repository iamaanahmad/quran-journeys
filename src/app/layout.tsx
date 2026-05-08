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
  title: "Quran Journeys — AI-Powered Daily Quran Coach",
  description:
    "Build a sustainable 10-20 minute daily Quran habit with personalized Read, Understand, Reflect sessions. Powered by Quran Foundation APIs and Gemini AI.",
  keywords: ["quran", "daily quran", "quran study", "quran foundation", "AI quran", "muslim professionals"],
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "Quran Journeys — AI-Powered Daily Quran Coach",
    description: "Personalized Read, Understand, Reflect sessions for busy professionals.",
    type: "website",
    url: "https://quranjourneys.netlify.app",
    images: [
      {
        url: "/qjlogo.png",
        width: 1200,
        height: 630,
        alt: "Quran Journeys",
      },
    ],
  },
  other: {
    google: "notranslate",
    "apple-mobile-web-app-title": "Quran Journeys",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
  },
};

export const viewport = {
  themeColor: "#0d5f4e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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
      translate="no"
    >
      <body className="min-h-full bg-[radial-gradient(circle_at_top,_#f7f1d8_0%,_#f8f4e8_35%,_#e8efe6_100%)] text-slate-900">
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
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
