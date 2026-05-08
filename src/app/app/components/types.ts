import type { ExplanationResult, MoodTag, LengthRating, SessionPlanDay, VerseItem, JourneyState, SessionLog } from "@/lib/types";

// ---------------------------------------------------------------------------
// Tafsir types
// ---------------------------------------------------------------------------

export interface TafsirItem {
  verseKey: string;
  text: string;
  resourceName: string;
}

// ---------------------------------------------------------------------------
// App-level shared types
// ---------------------------------------------------------------------------

export type SessionStep = "read" | "understand" | "reflect";
export type AppView = "dashboard" | "session" | "plan" | "insights";

export interface QfSessionState {
  connected: boolean;
  expiresAt: number | null;
}

export interface SyncState {
  source: "supabase" | "local" | "not-synced";
  message: string;
}

export interface WeeklyInsight {
  totalMinutes: number;
  completedSessions: number;
  topMood: MoodTag | "none";
  averageClarity: number;
  consistencyScore: number;
}

// Re-export from lib for convenience
export type { ExplanationResult, MoodTag, LengthRating, SessionPlanDay, VerseItem, JourneyState, SessionLog };
