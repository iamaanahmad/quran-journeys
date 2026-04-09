/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

function parseEnvFile(filePath) {
  const text = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (value.startsWith("\"") && value.endsWith("\"")) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function getEnv() {
  const envFile = path.join(__dirname, "..", ".env.local");
  const env = parseEnvFile(envFile);
  const qfEnv = (env.QF_ENV || "prelive").trim();
  const defaultBaseByEnv = {
    production: "https://apis.quran.foundation/auth",
    prelive: "https://apis-prelive.quran.foundation/auth",
  };
  const rawBase = (env.QF_USER_API_BASE_URL || defaultBaseByEnv[qfEnv] || defaultBaseByEnv.prelive)
    .replace(/\/$/, "");
  const baseUrl = rawBase.endsWith("/auth") ? rawBase : `${rawBase}/auth`;

  return {
    qfEnv,
    qfUserApiKey: env.QF_USER_API_KEY || "",
    clientId: env.QF_CLIENT_ID || env.QURAN_CLIENT_ID || "",
    baseUrl,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const body = await res.text();
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    json = body;
  }
  return { status: res.status, ok: res.ok, body: json, url };
}

function buildHeaders(config) {
  const headers = {
    Accept: "application/json",
    "x-client-id": config.clientId,
  };

  if (config.qfUserApiKey) {
    headers["x-auth-token"] = config.qfUserApiKey;
  }

  return headers;
}

async function testStreakEndpoint(config) {
  if (!config.clientId || !config.qfUserApiKey) {
    console.warn("⚠️ Set both QF_CLIENT_ID and QF_USER_API_KEY to validate user-bound APIs.");
    return;
  }

  const streakUrl = `${config.baseUrl}/v1/streaks/current-streak-days?type=QURAN`;
  console.log(`\n🔍 Testing streak endpoint: ${streakUrl}`);
  const headers = buildHeaders(config);

  const result = await fetchJson(streakUrl, {
    method: "GET",
    headers,
  });

  console.log(`  status: ${result.status}`);
  console.log("  body:", result.body);
}

async function testActivityEndpoint(config) {
  if (!config.clientId || !config.qfUserApiKey) {
    return;
  }

  const activityUrl = `${config.baseUrl}/v1/activity-days`;
  console.log(`\n🔍 Testing activity write endpoint: ${activityUrl}`);

  const headers = {
    ...buildHeaders(config),
    "Content-Type": "application/json",
    "x-timezone": config.timezone,
  };

  const payload = {
    type: "QURAN",
    seconds: 120,
    ranges: ["2:1"],
    mushafId: 2,
  };

  const result = await fetchJson(activityUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  console.log(`  status: ${result.status}`);
  console.log("  body:", result.body);
}

async function main() {
  const config = getEnv();
  console.log("Loaded environment:", {
    qfEnv: config.qfEnv,
    hasUserApiKey: !!config.qfUserApiKey,
    hasClientId: !!config.clientId,
    baseUrl: config.baseUrl,
    timezone: config.timezone,
  });

  await testStreakEndpoint(config);
  await testActivityEndpoint(config);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
