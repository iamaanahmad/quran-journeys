import type {
  UserProgressSummary,
  UserProgressSyncRequest,
  UserProgressSyncResponse,
} from "@/lib/types";

const LOCAL_SOURCE = "local-fallback" as const;

type LocalStore = Map<string, UserProgressSummary>;

declare global {
  var __quranJourneysProgressStore: LocalStore | undefined;
}

function getLocalStore(): LocalStore {
  if (!global.__quranJourneysProgressStore) {
    global.__quranJourneysProgressStore = new Map<string, UserProgressSummary>();
  }
  return global.__quranJourneysProgressStore;
}

function upsertLocalProgress(
  payload: UserProgressSyncRequest,
): UserProgressSummary {
  const localStore = getLocalStore();
  const summary: UserProgressSummary = {
    ...payload,
    updatedAt: new Date().toISOString(),
  };
  localStore.set(payload.userId, summary);
  return summary;
}

function getLocalProgress(userId: string): UserProgressSummary {
  const localStore = getLocalStore();
  const existing = localStore.get(userId);

  if (existing) {
    return existing;
  }

  const empty: UserProgressSummary = {
    userId,
    streakDays: 0,
    completedSessions: 0,
    minutesThisMonth: 0,
    totalMinutes: 0,
    lastSessionDate: null,
    updatedAt: new Date().toISOString(),
  };

  localStore.set(userId, empty);
  return empty;
}

export async function syncUserProgress(
  payload: UserProgressSyncRequest,
): Promise<UserProgressSyncResponse> {
  return {
    ok: true,
    source: LOCAL_SOURCE,
    progress: upsertLocalProgress(payload),
  };
}

export async function fetchUserProgress(
  userId: string,
): Promise<UserProgressSyncResponse> {
  return {
    ok: true,
    source: LOCAL_SOURCE,
    progress: getLocalProgress(userId),
  };
}
