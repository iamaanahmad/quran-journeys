import type {
  UserProgressSummary,
  UserProgressSyncRequest,
  UserProgressSyncResponse,
} from "@/lib/types";

const LOCAL_SOURCE = "local-fallback" as const;

const quranEnv = (process.env.QF_ENV ?? process.env.NEXT_PUBLIC_QF_ENV ?? "prelive").trim();
const quranEndpoint = (process.env.QF_USER_PROGRESS_ENDPOINT ?? "").trim();
const quranBaseUrl = (process.env.QF_USER_API_BASE_URL ?? "").trim();
const quranApiKey = (process.env.QF_USER_API_KEY ?? "").trim();
const qfOAuthEndpoint = (process.env.QF_OAUTH_ENDPOINT ?? "https://oauth2.quran.foundation").trim();
const qfClientId = (process.env.QF_CLIENT_ID ?? process.env.QURAN_CLIENT_ID ?? "").trim();
const qfClientSecret = (process.env.QF_CLIENT_SECRET ?? process.env.QURAN_CLIENT_SECRET ?? "").trim();

const defaultBaseByEnv: Record<string, string> = {
  production: "https://apis.quran.foundation",
  prelive: "https://apis-prelive.quran.foundation",
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

function buildApiUrl(userId: string): string | null {
  if (quranEndpoint) {
    if (quranEndpoint.includes("{userId}")) {
      return quranEndpoint.replace("{userId}", encodeURIComponent(userId));
    }
    return quranEndpoint;
  }

  const base = quranBaseUrl || defaultBaseByEnv[quranEnv] || defaultBaseByEnv.prelive;

  if (!base) {
    return null;
  }

  return `${base.replace(/\/$/, "")}/user-progress/${encodeURIComponent(userId)}`;
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

async function getQuranFoundationAuthToken(): Promise<string | undefined> {
  if (quranApiKey) {
    return quranApiKey;
  }

  if (!qfClientId || !qfClientSecret || !qfOAuthEndpoint) {
    return undefined;
  }

  const tokenUrl = `${qfOAuthEndpoint.replace(/\/$/, "")}/oauth/token`;
  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: qfClientId,
      client_secret: qfClientSecret,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Quran Foundation token exchange failed ${tokenResponse.status}`);
  }

  const tokenPayload = await tokenResponse.json();
  if (typeof tokenPayload.access_token === "string") {
    return tokenPayload.access_token;
  }

  throw new Error("Quran Foundation token response missing access_token");
}

async function tryFetchRemoteProgress(
  userId: string,
): Promise<Pick<UserProgressSyncResponse, "progress" | "status" | "apiEndpoint" | "remoteDetails">> {
  const apiUrl = buildApiUrl(userId);
  if (!apiUrl) {
    throw new Error("No Quran User API endpoint configured");
  }

  const headers = new Headers({ Accept: "application/json" });
  try {
    const token = await getQuranFoundationAuthToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch (error) {
    // proceed without token; the endpoint can still be hit with anonymous request.
    if (error instanceof Error) {
      throw new Error(`Auth token fetch failed: ${error.message}`);
    }
  }

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
    remoteDetails: "GET remote user progress successful",
  };
}

async function trySyncRemoteProgress(
  payload: UserProgressSyncRequest,
): Promise<Pick<UserProgressSyncResponse, "progress" | "status" | "apiEndpoint" | "remoteDetails">> {
  const apiUrl = buildApiUrl(payload.userId);
  if (!apiUrl) {
    throw new Error("No Quran User API endpoint configured");
  }

  const headers = new Headers({ "Content-Type": "application/json", Accept: "application/json" });
  try {
    const token = await getQuranFoundationAuthToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch (error) {
    // if auth token exchange failed, we still attempt remote call (may fallback later)
    if (error instanceof Error) {
      throw new Error(`Auth token fetch failed: ${error.message}`);
    }
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
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
    remoteDetails: "POST remote user progress successful",
  };
}

export async function syncUserProgress(
  payload: UserProgressSyncRequest,
): Promise<UserProgressSyncResponse> {
  try {
    const remote = await trySyncRemoteProgress(payload);
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
      apiEndpoint: buildApiUrl(payload.userId) ?? undefined,
      status: undefined,
      remoteDetails: "Falling back to local progress",
    };
  }
}

export async function fetchUserProgress(
  userId: string,
): Promise<UserProgressSyncResponse> {
  try {
    const remote = await tryFetchRemoteProgress(userId);
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
      apiEndpoint: buildApiUrl(userId) ?? undefined,
      status: undefined,
      remoteDetails: "Falling back to local progress",
    };
  }
}
