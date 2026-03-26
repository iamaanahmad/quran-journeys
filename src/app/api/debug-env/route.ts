import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasQfClientId: !!process.env.QF_CLIENT_ID,
    hasQuranClientId: !!process.env.QURAN_CLIENT_ID,
    hasQfClientSecret: !!process.env.QF_CLIENT_SECRET,
    hasQuranClientSecret: !!process.env.QURAN_CLIENT_SECRET,
    hasQfEnv: !!process.env.QF_ENV,
    qfEnvValue: process.env.QF_ENV,
    hasQfUserApiBaseUrl: !!process.env.QF_USER_API_BASE_URL,
    hasQfUserProgressEndpoint: !!process.env.QF_USER_PROGRESS_ENDPOINT,
    hasQfOauthEndpoint: !!process.env.QF_OAUTH_ENDPOINT,
    // Show first 4 chars to verify it's the right value
    qfClientIdPrefix: process.env.QF_CLIENT_ID?.substring(0, 4),
    quranClientIdPrefix: process.env.QURAN_CLIENT_ID?.substring(0, 4),
  });
}
