import { getSupabaseClient } from "@/lib/supabase-client";
import type { JourneyState } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

interface GoalRow {
  user_id: string;
  goal_type: JourneyState["goal"]["goalType"];
  target: string;
  time_per_day_minutes: number;
  language: string;
  profile_role: string;
  created_at: string;
  updated_at: string;
}

interface PlanRow {
  user_id: string;
  day_index: number;
  session_date: string;
  from_ayah_key: string;
  to_ayah_key: string;
  estimated_minutes: number;
  verses_json: JourneyState["plan"][number]["verses"];
  completed: boolean;
  updated_at: string;
}

interface LogRow {
  user_id: string;
  session_date: string;
  completed: boolean;
  length_rating: JourneyState["logs"][number]["lengthRating"];
  clarity_rating: number;
  mood_tag: JourneyState["logs"][number]["moodTag"];
  reflection_text: string;
  minutes_spent: number;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export type SignUpResult =
  | { status: "authenticated"; user: AuthUser }
  | { status: "confirmation_required"; email: string };

function normalizeUser(user: User): AuthUser {
  return {
    id: user.id,
    name: (user.user_metadata?.name as string | undefined) ?? "Reader",
    email: user.email ?? "",
  };
}

async function requireCurrentUser(): Promise<User> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error("No authenticated user");
  }

  return data.user;
}

export async function getCurrentAuthUser(): Promise<AuthUser | null> {
  try {
    const user = await requireCurrentUser();
    return normalizeUser(user);
  } catch {
    return null;
  }
}

export async function signUpWithEmail(
  email: string,
  password: string,
  name: string,
): Promise<SignUpResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Unable to sign up");
  }

  // In projects with email confirmation enabled, signUp can succeed without
  // creating a session. Treat this as success and prompt user to confirm email.
  if (!data.session) {
    return {
      status: "confirmation_required",
      email,
    };
  }

  const user = await requireCurrentUser();
  return {
    status: "authenticated",
    user: normalizeUser(user),
  };
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthUser> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    throw new Error(error.message);
  }

  const user = await requireCurrentUser();
  return normalizeUser(user);
}

export async function signOutCurrentUser(): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
}

export async function loadJourneyStateFromPrefs(): Promise<JourneyState | null> {
  const supabase = getSupabaseClient();
  const user = await requireCurrentUser();

  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<GoalRow>();

  if (goalError) {
    throw new Error(goalError.message);
  }

  if (!goal) {
    return null;
  }

  const [planResponse, logResponse] = await Promise.all([
    supabase
      .from("session_plans")
      .select("*")
      .eq("user_id", user.id)
      .order("day_index", { ascending: true })
      .returns<PlanRow[]>(),
    supabase
      .from("session_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("session_date", { ascending: true })
      .returns<LogRow[]>(),
  ]);

  if (planResponse.error) {
    throw new Error(planResponse.error.message);
  }

  if (logResponse.error) {
    throw new Error(logResponse.error.message);
  }

  const plan = (planResponse.data ?? [])
    .sort((left, right) => left.day_index - right.day_index)
    .map((row) => {
      return {
        dayIndex: row.day_index,
        date: row.session_date,
        fromAyahKey: row.from_ayah_key,
        toAyahKey: row.to_ayah_key,
        estimatedMinutes: row.estimated_minutes,
        verses: row.verses_json,
        completed: row.completed,
      };
    });

  const logs = (logResponse.data ?? [])
    .sort((left, right) => left.session_date.localeCompare(right.session_date))
    .map((row) => ({
      date: row.session_date,
      completed: row.completed,
      lengthRating: row.length_rating,
      clarityRating: row.clarity_rating,
      moodTag: row.mood_tag,
      reflectionText: row.reflection_text,
      minutesSpent: row.minutes_spent,
    }));

  return {
    createdAt: goal.created_at,
    goal: {
      goalType: goal.goal_type,
      target: goal.target,
      timePerDayMinutes: goal.time_per_day_minutes,
      language: goal.language,
      profileRole: goal.profile_role,
    },
    plan,
    logs,
  };
}

export async function saveJourneyStateToPrefs(
  state: JourneyState,
): Promise<void> {
  const supabase = getSupabaseClient();
  const user = await requireCurrentUser();
  const now = new Date().toISOString();

  const goalRow: GoalRow = {
    user_id: user.id,
    goal_type: state.goal.goalType,
    target: state.goal.target,
    time_per_day_minutes: state.goal.timePerDayMinutes,
    language: state.goal.language,
    profile_role: state.goal.profileRole,
    created_at: state.createdAt,
    updated_at: now,
  };

  const { error: goalError } = await supabase
    .from("goals")
    .upsert(goalRow, { onConflict: "user_id" });

  if (goalError) {
    throw new Error(goalError.message);
  }

  if (state.plan.length > 0) {
    const planRows: PlanRow[] = state.plan.map((day) => ({
      user_id: user.id,
      day_index: day.dayIndex,
      session_date: day.date,
      from_ayah_key: day.fromAyahKey,
      to_ayah_key: day.toAyahKey,
      estimated_minutes: day.estimatedMinutes,
      verses_json: day.verses,
      completed: day.completed,
      updated_at: now,
    }));

    const { error: planError } = await supabase
      .from("session_plans")
      .upsert(planRows, { onConflict: "user_id,day_index" });

    if (planError) {
      throw new Error(planError.message);
    }
  }

  if (state.logs.length > 0) {
    const logRows: LogRow[] = state.logs.map((log) => ({
      user_id: user.id,
      session_date: log.date,
      completed: log.completed,
      length_rating: log.lengthRating,
      clarity_rating: log.clarityRating,
      mood_tag: log.moodTag,
      reflection_text: log.reflectionText,
      minutes_spent: log.minutesSpent,
      updated_at: now,
    }));

    const { error: logError } = await supabase
      .from("session_logs")
      .upsert(logRows, { onConflict: "user_id,session_date" });

    if (logError) {
      throw new Error(logError.message);
    }
  }
}

export async function clearJourneyStateFromPrefs(): Promise<void> {
  const supabase = getSupabaseClient();
  const user = await requireCurrentUser();

  const [goalsDelete, plansDelete, logsDelete] = await Promise.all([
    supabase.from("goals").delete().eq("user_id", user.id),
    supabase.from("session_plans").delete().eq("user_id", user.id),
    supabase.from("session_logs").delete().eq("user_id", user.id),
  ]);

  const firstError = goalsDelete.error ?? plansDelete.error ?? logsDelete.error;
  if (firstError) {
    throw new Error(firstError.message);
  }
}
