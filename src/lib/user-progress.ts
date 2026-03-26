import type {
  UserProgressSummary,
  UserProgressSyncRequest,
  UserProgressSyncResponse,
} from "@/lib/types";

const LOCAL_SOURCE = "local-fallback" as const;
const REMOTE_SOURCE = "quran-foundation" as const;

type LocalStore = Map<string, UserProgressSummary>;

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

type QfEnvironment = "prelive" | "production";

interface UserApiAuth {
  headers: Record<string, string>;
}

declare global {
  var __quranJourneysProgressStore: LocalStore | undefined;
  var __quranJourneysTokenCache: TokenCache | undefined;
}

function getLocalStore(): LocalStore {
  if (!global.__quranJourneysProgressStore) {
    global.__quranJourneysProgressStore = new Map<string, UserProgressSummary>();
  }
  return global.__quranJourneysProgressStore;
}

function getQfEnvironment(): QfEnvironment {
  const raw = (process.env.QF_ENV ?? "prelive").toLowerCase();
  return raw === "production" ? "production" : "prelive";
}

function isEndpointCompatibleWithEnv(url: string, env: QfEnvironment): boolean {
  const normalized = url.toLowerCase();
  if (env === "production") {
    return !normalized.includes("apis-prelive.quran.foundation");
  }

  return !normalized.includes("apis.quran.foundation");
}

function getQfApiBaseUrl(): string {
  const env = getQfEnvironment();
  const explicit = process.env.QF_USER_API_BASE_URL;
  if (explicit && isEndpointCompatibleWithEnv(explicit, env)) {
    return explicit.replace(/\/$/, "");
  }

  return env === "production"
    ? "https://apis.quran.foundation"
    : "https://apis-prelive.quran.foundation";
}

function getQfOauthBaseUrl(): string {
  const explicit = process.env.QF_OAUTH_ENDPOINT;
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  return getQfEnvironment() === "production"
    ? "https://oauth2.quran.foundation"
    : "https://prelive-oauth2.quran.foundation";
}

function getConfiguredClientId(): string {
  return (
    process.env.QF_CLIENT_ID ??
    process.env.QURAN_CLIENT_ID ??
    process.env.QF_OAUTH_CLIENT_ID ??
    ""
  );
}

function getConfiguredClientSecret(): string {
  return (
    process.env.QF_CLIENT_SECRET ??
    process.env.QURAN_CLIENT_SECRET ??
    process.env.QF_OAUTH_CLIENT_SECRET ??
    ""
  );
}

function buildHeaders(auth: UserApiAuth, isWrite: boolean): Record<string, string> {
  return {
    ...(isWrite ? { "Content-Type": "application/json" } : {}),
    ...auth.headers,
    Accept: "application/json",
  };
}

function buildRemoteReadEndpoints(userId: string): string[] {
  const env = getQfEnvironment();
  const explicit = process.env.QF_USER_PROGRESS_ENDPOINT;
  if (explicit && isEndpointCompatibleWithEnv(explicit, env)) {
    const normalized = explicit.replace(/\/$/, "");
    if (normalized.includes("{userId}")) {
      return [normalized.replace("{userId}", encodeURIComponent(userId))];
    }
    return [normalized];
  }

  const base = getQfApiBaseUrl();
  return [`${base}/v1/streaks/current-streak-days?type=QURAN`];
}

function buildRemoteWriteEndpoints(): string[] {
  const base = getQfApiBaseUrl();
  return [`${base}/v1/reading-sessions`];
}

function parseAyahKey(
  ayahKey: string | null | undefined,
): { chapterNumber: number; verseNumber: number } {
  if (!ayahKey) {
    return { chapterNumber: 1, verseNumber: 1 };
  }

  const match = ayahKey.match(/^(\d+):(\d+)$/);
  if (!match) {
    return { chapterNumber: 1, verseNumber: 1 };
  }

  return {
    chapterNumber: Number(match[1]),
    verseNumber: Number(match[2]),
  };
}

function extractStreakDays(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const asRecord = payload as Record<string, unknown>;
  const direct = asRecord.days;
  if (typeof direct === "number") {
    return direct;
  }

  const data = asRecord.data;
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0] as Record<string, unknown>;
    if (typeof first?.days === "number") {
      return first.days;
    }
  }

  return null;
}

function buildFallbackWarning(
  mode: "read" | "write",
  endpoint?: string,
  statusCode?: number,
  missingConfigKeys: string[] = [],
): string {
  const endpointText = endpoint ? ` endpoint=${endpoint}.` : "";

  if (statusCode === 401) {
    return `Using local fallback. Quran User API returned 401 Unauthorized.${endpointText} Verify client credentials/token validity and environment (QF_ENV).`;
  }

  if (statusCode === 403) {
    return `Using local fallback. Quran User API returned 403 Forbidden.${endpointText} Your client token is valid but not permitted for this user endpoint. Request User API permissions or use a user-authorized token/API key.`;
  }

  if (statusCode && statusCode >= 500) {
    return `Using local fallback. Quran User API returned ${statusCode}.${endpointText} Remote service may be temporarily unavailable.`;
  }

  if (missingConfigKeys.length > 0) {
    return `Using local fallback. Missing server env: ${missingConfigKeys.join(", ")}. Configure these in deployment environment and redeploy.`;
  }

  const modeText = mode === "read" ? "streak read" : "reading session write";
  return `Using local fallback. Live User API ${modeText} is not configured or unavailable. Set QF_ENV, QF_CLIENT_ID/QF_CLIENT_SECRET (or QURAN_CLIENT_ID/QURAN_CLIENT_SECRET), and optional QF_USER_PROGRESS_ENDPOINT.`;
}

function getMissingUserApiConfig(): string[] {
  const staticApiKey = process.env.QF_USER_API_KEY?.trim();
  if (staticApiKey) {
    return [];
  }

  const missing: string[] = [];
  const clientId = getConfiguredClientId();
  const clientSecret = getConfiguredClientSecret();
  
  console.log('[QF Config Debug]', {
    hasClientId: !!clientId,
    hasClientSecret: !!clientSecret,
    env: getQfEnvironment(),
    QF_CLIENT_ID: !!process.env.QF_CLIENT_ID,
    QURAN_CLIENT_ID: !!process.env.QURAN_CLIENT_ID,
    QF_CLIENT_SECRET: !!process.env.QF_CLIENT_SECRET,
    QURAN_CLIENT_SECRET: !!process.env.QURAN_CLIENT_SECRET,
  });
  
  if (!clientId) {
    missing.push("QF_CLIENT_ID|QURAN_CLIENT_ID");
  }
  if (!clientSecret) {
    missing.push("QF_CLIENT_SECRET|QURAN_CLIENT_SECRET");
  }

  return missing;
}

async function getUserApiAuth(): Promise<UserApiAuth | null> {
  const staticApiKey = process.env.QF_USER_API_KEY;
  if (staticApiKey) {
    return {
      headers: {
        Authorization: `Bearer ${staticApiKey}`,
      },
    };
  }

  const oauthEndpoint = getQfOauthBaseUrl();
  const clientId = getConfiguredClientId();
  const clientSecret = getConfiguredClientSecret();

  console.log('[QF OAuth Debug]', {
    oauthEndpoint,
    hasClientId: !!clientId,
    hasClientSecret: !!clientSecret,
    clientIdLength: clientId?.length,
    clientSecretLength: clientSecret?.length,
  });

  if (!oauthEndpoint || !clientId || !clientSecret) {
    console.log('[QF OAuth] Missing credentials, returning null');
    return null;
  }

  const cached = global.__quranJourneysTokenCache;
  if (cached && Date.now() < cached.expiresAt - 30_000) {
    return {
      headers: {
        "x-auth-token": cached.accessToken,
        "x-client-id": clientId,
        Authorization: `Bearer ${cached.accessToken}`,
      },
    };
  }

  const tokenBase = oauthEndpoint.replace(/\/$/, "");
  const candidateUrls = [
    `${tokenBase}/oauth2/token`,
    `${tokenBase}/oauth/token`,
    `${tokenBase}/token`,
  ];

  for (const tokenUrl of candidateUrls) {
    try {
      console.log('[QF OAuth] Attempting token fetch from:', tokenUrl);
      
      const baseBody = new URLSearchParams({
        grant_type: "client_credentials",
        scope: "content",
      });
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

      const basicAuthResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          Authorization: `Basic ${basicAuth}`,
        },
        body: baseBody.toString(),
      });

      console.log('[QF OAuth] Basic auth response status:', basicAuthResponse.status);

      const response = basicAuthResponse.ok
        ? basicAuthResponse
        : await fetch(tokenUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "application/json",
            },
            body: new URLSearchParams({
              grant_type: "client_credentials",
              client_id: clientId,
              client_secret: clientSecret,
              scope: "content",
            }).toString(),
          });

      console.log('[QF OAuth] Final response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('[QF OAuth] Error response:', errorText);
        continue;
      }

      const payload = (await response.json()) as {
        access_token?: string;
        expires_in?: number;
      };

      console.log('[QF OAuth] Token received:', !!payload.access_token);

      if (!payload.access_token) {
        continue;
      }

      const ttlMs = (payload.expires_in ?? 300) * 1000;
      global.__quranJourneysTokenCache = {
        accessToken: payload.access_token,
        expiresAt: Date.now() + ttlMs,
      };

      return {
        headers: {
          "x-auth-token": payload.access_token,
          "x-client-id": clientId,
          Authorization: `Bearer ${payload.access_token}`,
        },
      };
    } catch (error) {
      console.log('[QF OAuth] Exception during token fetch:', error);
      continue;
    }
  }

  console.log('[QF OAuth] All token URLs failed');
  return null;
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
  const endpoints = buildRemoteWriteEndpoints();
  const auth = await getUserApiAuth();
  const missingConfigKeys = auth ? [] : getMissingUserApiConfig();
  const readingSession = parseAyahKey(payload.lastReadAyahKey);
  let lastStatusCode: number | undefined;
  let lastEndpoint: string | undefined;

  if (endpoints.length > 0 && auth) {
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: buildHeaders(auth, true),
          body: JSON.stringify(readingSession),
        });

        if (response.ok) {
          const localMirror = upsertLocalProgress(payload);
          return {
            ok: true,
            source: REMOTE_SOURCE,
            progress: localMirror,
          };
        }

        lastStatusCode = response.status;
        lastEndpoint = endpoint;
      } catch {
        lastEndpoint = endpoint;
        continue;
      }
    }
  }

  return {
    ok: true,
    source: LOCAL_SOURCE,
    progress: upsertLocalProgress(payload),
    warning: buildFallbackWarning("write", lastEndpoint, lastStatusCode, missingConfigKeys),
  };
}

export async function fetchUserProgress(
  userId: string,
): Promise<UserProgressSyncResponse> {
  const endpoints = buildRemoteReadEndpoints(userId);
  const auth = await getUserApiAuth();
  const missingConfigKeys = auth ? [] : getMissingUserApiConfig();
  let lastStatusCode: number | undefined;
  let lastEndpoint: string | undefined;

  console.log('[QF User Progress] Fetch attempt', {
    userId,
    endpoints,
    hasAuth: !!auth,
    missingConfigKeys,
  });

  if (endpoints.length > 0 && auth) {
    for (const endpoint of endpoints) {
      try {
        console.log('[QF User Progress] Fetching from:', endpoint);
        
        const response = await fetch(endpoint, {
          method: "GET",
          headers: buildHeaders(auth, false),
        });

        console.log('[QF User Progress] Response status:', response.status);

        if (response.ok) {
          const remotePayload = (await response.json()) as unknown;
          console.log('[QF User Progress] Response payload:', remotePayload);
          
          const streakDays = extractStreakDays(remotePayload);
          console.log('[QF User Progress] Extracted streak days:', streakDays);
          
          if (streakDays !== null) {
            const localSnapshot = getLocalProgress(userId);
            return {
              ok: true,
              source: REMOTE_SOURCE,
              progress: {
                ...localSnapshot,
                streakDays,
                updatedAt: new Date().toISOString(),
              },
            };
          }
        }

        lastStatusCode = response.status;
        lastEndpoint = endpoint;
        
        if (!response.ok) {
          const errorText = await response.text();
          console.log('[QF User Progress] Error response:', errorText);
        }
      } catch (error) {
        console.log('[QF User Progress] Exception:', error);
        lastEndpoint = endpoint;
        continue;
      }
    }
  }

  console.log('[QF User Progress] Falling back to local storage');

  return {
    ok: true,
    source: LOCAL_SOURCE,
    progress: getLocalProgress(userId),
    warning: buildFallbackWarning("read", lastEndpoint, lastStatusCode, missingConfigKeys),
  };
}
