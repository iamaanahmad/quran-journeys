# Quran Journeys for Busy Professionals

AI-assisted Quran coach designed for busy professionals who need a consistent, deep Quran routine in 10-20 minutes/day.

## Judges: Start Here

1. Open `/` and choose one of:
- Guest mode for instant demo
- Auth mode (`/auth`) for synced persistence
2. Generate a 7-day plan from onboarding.
3. Complete one full Read -> Understand -> Reflect session.
4. Check **Live API Evidence** panel to verify:
- Quran Content source (`quran-foundation` or fallback)
- Quran User API source (`quran-foundation` or fallback)
5. Open **Weekly Insight** and click **Copy Weekly Summary**.

This project is designed around Quran Foundation's mission to transform every human through Quranic guidance, with a practical 10-20 minute daily routine for busy Muslims.

## What is implemented

- Onboarding and goal setup (goal type, target, role, language, time budget)
- 7-day personalized journey plan generated via `/api/plan`
- Daily session flow: Read -> Understand -> Reflect
- Read step with Arabic text, translation, and audio playback
- Understand step using `/api/explain` (Gemini-backed when key is present, safe fallback otherwise)
- Reflect step with prompts, mood tag, clarity rating, and session-length feedback
- Adaptive planning that increases/decreases verse chunk size based on feedback
- Lightweight spaced repetition that resurfaces difficult verses in upcoming sessions
- Dashboard metrics: goal progress, streak, and total minutes this month
- Weekly insight summary (sessions, minutes, top mood, clarity, consistency score)
- Small accountability circles (up to 3 members) with copyable weekly summary
- Local persistence for demo reliability using browser storage
- User identity + progress sync via `/api/user-progress` with Quran Foundation adapter and local fallback
- Supabase Auth (email/password) with backend persistence of journey state in Postgres
- Live API evidence panel showing Quran Content API and User API source/status

## API usage

This app uses Quran Foundation content endpoints in `src/lib/quran-foundation.ts`:

- `GET /api/v4/quran/verses/uthmani?chapter_number=2`
- `GET /api/v4/quran/translations/131?chapter_number=2`

If those calls fail, it falls back to bundled Quran demo verses so the demo never breaks.

Quran user progress adapter:

- `GET /api/user-progress?userId=...`
- `POST /api/user-progress`

Runtime adapter sources:

- Quran Foundation User API when credentials/endpoints are valid
- Local fallback for demo reliability

Platform references:

- https://quran.com/developers
- https://api-docs.quran.foundation/docs/quickstart/

## Tech stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS 4
- Supabase JS SDK for authentication and persisted user state

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Create environment file:

```bash
copy .env.example .env.local
```

3. Start the app:

```bash
npm run dev
```

4. Open:

`http://localhost:3000`

## Environment variables

- `GEMINI_API_KEY` (optional): enables richer `/api/explain` responses
- `GEMINI_MODEL` (optional): defaults to `gemini-2.0-flash`
- `NEXT_PUBLIC_SUPABASE_URL` (required for auth): Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (required for auth): Supabase publishable key
- `QF_ENV` (optional): `prelive` (default) or `production`
- `QF_CLIENT_ID` or `QURAN_CLIENT_ID` (required for OAuth mode): client ID from Quran Foundation registration
- `QF_CLIENT_SECRET` or `QURAN_CLIENT_SECRET` (required for OAuth mode): client secret (server-side only)
- `QF_USER_PROGRESS_ENDPOINT` (optional): exact User API progress endpoint, e.g. `https://.../user-progress/{userId}`
- `QF_USER_API_BASE_URL` (optional alternative to endpoint): base URL for User API
- `QF_USER_API_KEY` (optional): static bearer token if your environment uses one

Without API keys/endpoints, the app still works in fallback mode.

## Hackathon readiness notes

- Product framing and feature set align with impact, UX, and innovation criteria.
- Content API integration is implemented with real Quran Foundation endpoints.
- User progress sync is implemented through a provider adapter. With valid credentials it syncs to Quran Foundation User API; otherwise it stores in local fallback for reliable demos.
- Supabase is now the default real backend for sign-in and user journey persistence; local storage is used only when not authenticated.
- Use `docs/submission-checklist.md` to finalize delivery assets before submission.

## Criteria mapping

- Impact on Quran engagement: Daily 10-20 minute guided habit loop with streak + insight tracking.
- Product quality and UX: Separate auth flow, step-based sessions, adaptive planner, judge tour hints.
- Technical execution: Next.js + TypeScript, lint/build validated, resilient fallback strategy.
- Innovation: Theme journeys, adaptive pacing, spaced repetition, weekly insights, circles.
- Effective API usage: Quran Foundation content endpoints and user progress adapter with runtime evidence panel.

## Roadmap

- Curated ontology-based thematic journeys with deeper tafsir linking
- Weekly email insights delivery
- Advanced multi-language personalization
- Circle-level shared milestones and reminders

## Commands

- `npm run dev` - local development
- `npm run lint` - lint checks
- `npm run build` - production build validation
