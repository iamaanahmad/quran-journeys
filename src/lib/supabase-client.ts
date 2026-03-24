import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Database {
  public: {
    Tables: {
      goals: {
        Row: {
          id: string;
          user_id: string;
          goal_type: "khatam" | "surah" | "theme";
          target: string;
          time_per_day_minutes: number;
          language: string;
          profile_role: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          goal_type: "khatam" | "surah" | "theme";
          target: string;
          time_per_day_minutes: number;
          language: string;
          profile_role: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          goal_type?: "khatam" | "surah" | "theme";
          target?: string;
          time_per_day_minutes?: number;
          language?: string;
          profile_role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      session_plans: {
        Row: {
          id: string;
          user_id: string;
          day_index: number;
          session_date: string;
          from_ayah_key: string;
          to_ayah_key: string;
          estimated_minutes: number;
          verses_json: unknown;
          completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          day_index: number;
          session_date: string;
          from_ayah_key: string;
          to_ayah_key: string;
          estimated_minutes: number;
          verses_json?: unknown;
          completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          day_index?: number;
          session_date?: string;
          from_ayah_key?: string;
          to_ayah_key?: string;
          estimated_minutes?: number;
          verses_json?: unknown;
          completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      session_logs: {
        Row: {
          id: string;
          user_id: string;
          session_date: string;
          completed: boolean;
          length_rating: "too_short" | "ok" | "too_long";
          clarity_rating: number;
          mood_tag:
            | "calm"
            | "hopeful"
            | "anxious"
            | "grateful"
            | "focused"
            | "tired";
          reflection_text: string;
          minutes_spent: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_date: string;
          completed?: boolean;
          length_rating: "too_short" | "ok" | "too_long";
          clarity_rating: number;
          mood_tag:
            | "calm"
            | "hopeful"
            | "anxious"
            | "grateful"
            | "focused"
            | "tired";
          reflection_text?: string;
          minutes_spent: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_date?: string;
          completed?: boolean;
          length_rating?: "too_short" | "ok" | "too_long";
          clarity_rating?: number;
          mood_tag?:
            | "calm"
            | "hopeful"
            | "anxious"
            | "grateful"
            | "focused"
            | "tired";
          reflection_text?: string;
          minutes_spent?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

let supabaseSingleton: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (supabaseSingleton) {
    return supabaseSingleton;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }

  supabaseSingleton = createClient<Database>(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseSingleton;
}
