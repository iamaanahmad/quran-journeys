export type GoalType = "khatam" | "surah" | "theme";

export type LengthRating = "too_short" | "ok" | "too_long";

export type MoodTag =
  | "calm"
  | "hopeful"
  | "anxious"
  | "grateful"
  | "focused"
  | "tired";

export interface GoalSetup {
  goalType: GoalType;
  target: string;
  timePerDayMinutes: number;
  language: string;
  profileRole: string;
}

export interface VerseItem {
  key: string;
  surah: number;
  ayah: number;
  arabic: string;
  translation: string;
  audioUrl: string;
}

export interface SessionPlanDay {
  dayIndex: number;
  date: string;
  fromAyahKey: string;
  toAyahKey: string;
  estimatedMinutes: number;
  verses: VerseItem[];
  completed: boolean;
}

export interface ExplanationResult {
  keyPoints: string[];
  simpleSummary: string;
  reflectionPrompts: string[];
  disclaimer: string;
}

export interface SessionLog {
  date: string;
  completed: boolean;
  lengthRating: LengthRating;
  clarityRating: number;
  moodTag: MoodTag;
  reflectionText: string;
  minutesSpent: number;
}

export interface JourneyState {
  createdAt: string;
  goal: GoalSetup;
  plan: SessionPlanDay[];
  logs: SessionLog[];
}

export interface UserIdentity {
  userId: string;
  email: string;
  displayName: string;
}

export interface UserProgressSummary {
  userId: string;
  streakDays: number;
  completedSessions: number;
  minutesThisMonth: number;
  totalMinutes: number;
  lastSessionDate: string | null;
  updatedAt: string;
}

export interface UserProgressSyncRequest {
  userId: string;
  streakDays: number;
  completedSessions: number;
  minutesThisMonth: number;
  totalMinutes: number;
  lastSessionDate: string | null;
  lastReadAyahKey?: string | null;
}

export interface UserProgressSyncResponse {
  ok: boolean;
  source: "quran-foundation" | "local-fallback";
  progress: UserProgressSummary;
  warning?: string;
}