import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("qf_access_token");
  response.cookies.delete("qf_refresh_token");
  response.cookies.delete("qf_id_token");
  response.cookies.delete("qf_token_expires_at");
  response.cookies.delete("qf_oauth_state");
  response.cookies.delete("qf_pkce_verifier");
  response.cookies.delete("qf_oauth_next");
  return response;
}
