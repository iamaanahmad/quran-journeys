import type {
  UserProgressSummary,
  UserProgressSyncRequest,
  UserProgressSyncResponse,
} from "@/lib/types";

const LOCAL_SOURCE = "local-fallback" as const;

const quranEnv = (process.env.QF_ENV ?? process.env.NEXT_PUBLIC_QF_ENV ?? "prelive").trim();
const quranBaseUrl = (process.env.QF_USER_API_BASE_URL ?? "").trim();
const quranApiKey = (process.env.QF_USER_API_KEY ?? "").trim();
const qfClientId = (process.env.QF_CLIENT_ID ?? process.env.QURAN_CLIENT_ID ?? "").trim();

const defaultBaseByEnv: Record<string, string> = {
  production: "https://apis.quran.foundation/auth",
  prelive: "https://apis-prelive.quran.foundation/auth",
};

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

function buildBaseUrl(): string | null {
  const base = quranBaseUrl || defaultBaseByEnv[quranEnv] || defaultBaseByEnv.prelive;
  if (!base) {
    return null;
  }

  const trimmed = base.replace(/\/$/, "");
  return trimmed.endsWith("/auth") ? trimmed : `${trimmed}/auth`;
}

function buildStreakUrl(): string | undefined {
  const base = buildBaseUrl();
  return base ? `${base}/v1/streaks/current-streak-days?type=QURAN` : undefined;
}

function buildActivityDaysUrl(): string | undefined {
  const base = buildBaseUrl();
  return base ? `${base}/v1/activity-days` : undefined;
}

function normalizeRemoteProgress(
  value: unknown,
  userId: string,
): UserProgressSummary {
  const now = new Date().toISOString();

  if (typeof value === "object" && value !== null) {
    const rec = value as Record<string, unknown>;

    const streakDays =
      typeof rec.streakDays === "number"
        ? rec.streakDays
        : typeof rec.currentStreakDays === "number"
          ? rec.currentStreakDays
          : 0;

    const completedSessions =
      typeof rec.completedSessions === "number" ? rec.completedSessions : 0;

    const minutesThisMonth =
      typeof rec.minutesThisMonth === "number" ? rec.minutesThisMonth : 0;

    const totalMinutes =
      typeof rec.totalMinutes === "number" ? rec.totalMinutes : 0;

    const lastSessionDate =
      typeof rec.lastSessionDate === "string" ? rec.lastSessionDate : null;

    return {
      userId,
      streakDays,
      completedSessions,
      minutesThisMonth,
      totalMinutes,
      lastSessionDate,
      updatedAt: now,
    };
  }

  return {
    userId,
    streakDays: 0,
    completedSessions: 0,
    minutesThisMonth: 0,
    totalMinutes: 0,
    lastSessionDate: null,
    updatedAt: now,
  };
}

function buildAuthHeaders(accessToken?: string, timezone?: string): Headers {
  const headers = new Headers({ Accept: "application/json" });
  const token = (accessToken ?? quranApiKey).trim();

  if (token) {
    headers.set("x-auth-token", token);
  }

  if (qfClientId) {
    headers.set("x-client-id", qfClientId);
  }

  if (timezone) {
    headers.set("x-timezone", timezone);
  }

  return headers;
}

async function tryFetchRemoteProgress(
  userId: string,
  accessToken?: string,
): Promise<Pick<UserProgressSyncResponse, "progress" | "status" | "apiEndpoint" | "remoteDetails">> {
  const apiUrl = buildStreakUrl();
  if (!apiUrl) {
    throw new Error("No Quran User API endpoint configured");
  }

  const token = (accessToken ?? quranApiKey).trim();
  if (!token) {
    throw new Error("Quran account not connected (missing auth token).");
  }

  const headers = buildAuthHeaders(accessToken);

  const response = await fetch(apiUrl, {
    method: "GET",
    headers,
  });

  const status = response.status;

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Quran User API GET failed ${status} ${text}`);
  }

  const payload = await response.json();

  return {
    progress: normalizeRemoteProgress(payload, userId),
    status,
    apiEndpoint: apiUrl,
    remoteDetails: "GET /auth/v1/streaks/current-streak-days successful",
  };
}

async function trySyncRemoteProgress(
  payload: UserProgressSyncRequest,
  accessToken?: string,
  timezone?: string,
): Promise<Pick<UserProgressSyncResponse, "progress" | "status" | "apiEndpoint" | "remoteDetails">> {
  const apiUrl = buildActivityDaysUrl();
  if (!apiUrl) {
    throw new Error("No Quran User API endpoint configured");
  }

  const token = (accessToken ?? quranApiKey).trim();
  if (!token) {
    throw new Error("Quran account not connected (missing auth token).");
  }

  const headers = buildAuthHeaders(accessToken, timezone);
  headers.set("Content-Type", "application/json");

  const activityPayload = {
    type: "QURAN",
    seconds: Math.max(0, Math.round(payload.totalMinutes * 60)),
    ranges: payload.lastReadAyahKey ? [payload.lastReadAyahKey] : [],
    mushafId: 2,
    ...(payload.lastSessionDate ? { date: payload.lastSessionDate } : {}),
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(activityPayload),
  });

  const status = response.status;

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Quran User API POST failed ${status} ${text}`);
  }

  const payloadResponse = await response.json();

  return {
    progress: normalizeRemoteProgress(payloadResponse, payload.userId),
    status,
    apiEndpoint: apiUrl,
    remoteDetails: "POST /auth/v1/activity-days successful",
  };
}

export async function syncUserProgress(
  payload: UserProgressSyncRequest,
  options?: { accessToken?: string; timezone?: string },
): Promise<UserProgressSyncResponse> {
  try {
    const remote = await trySyncRemoteProgress(
      payload,
      options?.accessToken,
      options?.timezone,
    );
    return {
      ok: true,
      source: "quran-foundation",
      progress: remote.progress,
      apiEndpoint: remote.apiEndpoint,
      status: remote.status,
      remoteDetails: remote.remoteDetails,
    };
  } catch (error) {
    const fallback = upsertLocalProgress(payload);
    return {
      ok: true,
      source: LOCAL_SOURCE,
      progress: fallback,
      warning:
        error instanceof Error
          ? `Fallback to local because: ${error.message}`
          : "Fallback to local user progress",
      apiEndpoint: buildActivityDaysUrl(),
      status: undefined,
      remoteDetails: "Falling back to local progress",
    };
  }
}

export async function fetchUserProgress(
  userId: string,
  options?: { accessToken?: string },
): Promise<UserProgressSyncResponse> {
  try {
    const remote = await tryFetchRemoteProgress(userId, options?.accessToken);
    return {
      ok: true,
      source: "quran-foundation",
      progress: remote.progress,
      apiEndpoint: remote.apiEndpoint,
      status: remote.status,
      remoteDetails: remote.remoteDetails,
    };
  } catch (error) {
    const fallback = getLocalProgress(userId);
    return {
      ok: true,
      source: LOCAL_SOURCE,
      progress: fallback,
      warning:
        error instanceof Error
          ? `Fallback to local because: ${error.message}`
          : "Fallback to local user progress",
      apiEndpoint: buildStreakUrl(),
      status: undefined,
      remoteDetails: "Falling back to local progress",
    };
  }
}
