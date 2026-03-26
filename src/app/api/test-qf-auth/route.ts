import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.QF_CLIENT_ID || process.env.QURAN_CLIENT_ID || "";
  const clientSecret = process.env.QF_CLIENT_SECRET || process.env.QURAN_CLIENT_SECRET || "";
  const oauthEndpoint = process.env.QF_OAUTH_ENDPOINT || "https://oauth2.quran.foundation";
  
  const results = {
    config: {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      oauthEndpoint,
    },
    tokenAttempts: [] as Array<{
      url: string;
      method: string;
      status: number;
      success: boolean;
      error?: string;
      hasToken?: boolean;
    }>,
  };

  const candidateUrls = [
    `${oauthEndpoint}/oauth2/token`,
    `${oauthEndpoint}/oauth/token`,
    `${oauthEndpoint}/token`,
  ];

  for (const tokenUrl of candidateUrls) {
    try {
      // Try Basic Auth first
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const basicAuthResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          scope: "content",
        }).toString(),
      });

      const basicAuthText = await basicAuthResponse.text();
      let basicAuthJson;
      try {
        basicAuthJson = JSON.parse(basicAuthText);
      } catch {
        basicAuthJson = { raw: basicAuthText };
      }

      results.tokenAttempts.push({
        url: tokenUrl,
        method: "Basic Auth",
        status: basicAuthResponse.status,
        success: basicAuthResponse.ok,
        hasToken: !!(basicAuthJson as any).access_token,
        error: basicAuthResponse.ok ? undefined : basicAuthText.substring(0, 200),
      });

      if (basicAuthResponse.ok && (basicAuthJson as any).access_token) {
        // Test the token with streak API
        const streakUrl = "https://apis.quran.foundation/v1/streaks/current-streak-days?type=QURAN";
        const streakResponse = await fetch(streakUrl, {
          method: "GET",
          headers: {
            "x-auth-token": (basicAuthJson as any).access_token,
            "x-client-id": clientId,
            Authorization: `Bearer ${(basicAuthJson as any).access_token}`,
            Accept: "application/json",
          },
        });

        const streakText = await streakResponse.text();
        let streakJson;
        try {
          streakJson = JSON.parse(streakText);
        } catch {
          streakJson = { raw: streakText };
        }

        return NextResponse.json({
          ...results,
          streakTest: {
            url: streakUrl,
            status: streakResponse.status,
            success: streakResponse.ok,
            response: streakJson,
          },
        });
      }

      // Try body credentials if Basic Auth failed
      if (!basicAuthResponse.ok) {
        const bodyAuthResponse = await fetch(tokenUrl, {
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

        const bodyAuthText = await bodyAuthResponse.text();
        let bodyAuthJson;
        try {
          bodyAuthJson = JSON.parse(bodyAuthText);
        } catch {
          bodyAuthJson = { raw: bodyAuthText };
        }

        results.tokenAttempts.push({
          url: tokenUrl,
          method: "Body Credentials",
          status: bodyAuthResponse.status,
          success: bodyAuthResponse.ok,
          hasToken: !!(bodyAuthJson as any).access_token,
          error: bodyAuthResponse.ok ? undefined : bodyAuthText.substring(0, 200),
        });

        if (bodyAuthResponse.ok && (bodyAuthJson as any).access_token) {
          // Test the token with streak API
          const streakUrl = "https://apis.quran.foundation/v1/streaks/current-streak-days?type=QURAN";
          const streakResponse = await fetch(streakUrl, {
            method: "GET",
            headers: {
              "x-auth-token": (bodyAuthJson as any).access_token,
              "x-client-id": clientId,
              Authorization: `Bearer ${(bodyAuthJson as any).access_token}`,
              Accept: "application/json",
            },
          });

          const streakText = await streakResponse.text();
          let streakJson;
          try {
            streakJson = JSON.parse(streakText);
          } catch {
            streakJson = { raw: streakText };
          }

          return NextResponse.json({
            ...results,
            streakTest: {
              url: streakUrl,
              status: streakResponse.status,
              success: streakResponse.ok,
              response: streakJson,
            },
          });
        }
      }
    } catch (error) {
      results.tokenAttempts.push({
        url: tokenUrl,
        method: "Exception",
        status: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json(results);
}
