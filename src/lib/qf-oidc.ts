import { createHash, randomBytes } from "node:crypto";

export interface QfOidcConfig {
  clientId: string;
  clientSecret?: string;
  oauthBaseUrl: string;
  redirectUri: string;
  scope: string;
}

const defaultOauthByEnv: Record<string, string> = {
  production: "https://oauth2.quran.foundation",
  prelive: "https://prelive-oauth2.quran.foundation",
};

function base64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function generatePkceVerifier(): string {
  return base64Url(randomBytes(48));
}

export function generatePkceChallenge(verifier: string): string {
  return base64Url(createHash("sha256").update(verifier).digest());
}

export function generateStateToken(): string {
  return base64Url(randomBytes(24));
}

export function getQfOidcConfig(origin?: string): QfOidcConfig {
  const env = (process.env.QF_ENV ?? process.env.NEXT_PUBLIC_QF_ENV ?? "prelive").trim();
  const clientId = (process.env.QF_CLIENT_ID ?? process.env.QURAN_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.QF_CLIENT_SECRET ?? process.env.QURAN_CLIENT_SECRET ?? "").trim();

  const oauthBase =
    (process.env.QF_OAUTH_BASE_URL ?? process.env.QF_OAUTH_ENDPOINT ?? "").trim() ||
    defaultOauthByEnv[env] ||
    defaultOauthByEnv.prelive;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  const originUrl = (origin ?? "").trim();
  const redirectUri =
    (process.env.QF_OAUTH_REDIRECT_URI ?? "").trim() ||
    (originUrl ? `${originUrl.replace(/\/$/, "")}/api/qf-auth/callback` : "") ||
    (appUrl ? `${appUrl.replace(/\/$/, "")}/api/qf-auth/callback` : "");

  // We hardcode the scopes to a known working set that includes bookmarks and activity.
  // We avoid 'profile', 'email', and 'post' which can trigger 'oauth_invalid_scope'.
  // This ensures we get the necessary permissions for user data sync.
  const scope = "openid offline_access bookmark reading_session activity_day";

  if (!clientId) {
    throw new Error("Missing QF_CLIENT_ID (or QURAN_CLIENT_ID)");
  }

  if (!oauthBase) {
    throw new Error("Missing QF OAuth base URL");
  }

  if (!redirectUri) {
    throw new Error("Missing QF OAuth redirect URI (set QF_OAUTH_REDIRECT_URI or NEXT_PUBLIC_APP_URL)");
  }

  return {
    clientId,
    clientSecret: clientSecret || undefined,
    oauthBaseUrl: oauthBase.replace(/\/$/, ""),
    redirectUri,
    scope,
  };
}
