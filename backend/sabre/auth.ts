type SabreToken = { accessToken: string; expiresAt: number };

// Sessionless tokens last 7 days and aren't affected by inactivity — cache
// in memory so we're not re-authenticating on every Sabre call.
let cachedToken: SabreToken | null = null;

function getBaseUrl(): string {
  // Point this at your test/cert/prod Sabre REST base URL via env.
  return process.env.SABRE_BASE_URL || "https://api.test.sabre.com";
}

// Sabre's Authorization header isn't a plain base64(user:pass) — it's
// base64(user) and base64(pass) joined with ":", then base64'd again.
// Verified by decoding the worked example in Sabre's "Get a Token" guide:
// "VjE6dXNlcmlkOmdyb3VwOmRvbWFpbg==:MTIzNDU=" decodes to
// "V1:userid:group:domain" (username) and "12345" (password).
function buildBasicAuthHeader(username: string, password: string): string {
  const encodedUsername = Buffer.from(username, "utf-8").toString("base64");
  const encodedPassword = Buffer.from(password, "utf-8").toString("base64");
  const combined = `${encodedUsername}:${encodedPassword}`;
  return Buffer.from(combined, "utf-8").toString("base64");
}

async function requestToken(url: string, authHeader: string, body: URLSearchParams): Promise<SabreToken> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Sabre auth failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    // Docs list expires_in as 604800s (7 days) for sessionless tokens;
    // trust whatever Sabre actually returns, with that as a fallback.
    expiresAt: Date.now() + (data.expires_in ?? 604800) * 1000 - 60_000,
  };
}

// v2: EPR-only sessionless token — Authorization header built from your EPR
// username (format "V1:<userid>:<PCC>:<domain>") and EPR password, body is
// just grant_type=client_credentials. This is the path that works with
// Developer Hub / DEVCENTER test credentials, since it needs no Client
// ID/Secret. Confirmed against Sabre's own worked example in their "Get a
// Token" guide.
async function getSabreTokenV2(): Promise<SabreToken> {
  const eprUsername = process.env.SABRE_EPR_USERNAME;
  const eprPassword = process.env.SABRE_EPR_PASSWORD;
  if (!eprUsername || !eprPassword) {
    throw new Error("Missing SABRE_EPR_USERNAME / SABRE_EPR_PASSWORD");
  }

  return requestToken(
    `${getBaseUrl()}/v2/auth/token`,
    buildBasicAuthHeader(eprUsername, eprPassword),
    new URLSearchParams({ grant_type: "client_credentials" })
  );
}

// v3: Client ID/Secret identify the calling application in the
// Authorization header; EPR credentials go in the body instead
// (grant_type=password) so Sabre knows which EPR the app is acting on
// behalf of. Sabre's guide describes this shape in prose but — unlike v2 —
// doesn't give a full worked request/response example, so the header
// encoding here is extrapolated from v2's confirmed scheme rather than
// independently verified. Prefer v2 unless you specifically need
// client-app-level auth (e.g. you were issued a Client ID/Secret by your
// account manager and want calls scoped to that app).
async function getSabreTokenV3(): Promise<SabreToken> {
  const clientId = process.env.SABRE_CLIENT_ID;
  const clientSecret = process.env.SABRE_CLIENT_SECRET;
  const eprUsername = process.env.SABRE_EPR_USERNAME;
  const eprPassword = process.env.SABRE_EPR_PASSWORD;
  if (!clientId || !clientSecret || !eprUsername || !eprPassword) {
    throw new Error(
      "Missing SABRE_CLIENT_ID / SABRE_CLIENT_SECRET / SABRE_EPR_USERNAME / SABRE_EPR_PASSWORD"
    );
  }

  return requestToken(
    `${getBaseUrl()}/v3/auth/token`,
    buildBasicAuthHeader(clientId, clientSecret),
    new URLSearchParams({ grant_type: "password", username: eprUsername, password: eprPassword })
  );
}

// Defaults to v2 (EPR-only) since it's the confirmed-correct path and
// matches what Developer Hub / DEVCENTER test credentials need. Set
// SABRE_TOKEN_VERSION=v3 to use the Client ID/Secret + EPR body flow
// instead.
export async function getSabreToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  cachedToken =
    process.env.SABRE_TOKEN_VERSION === "v3" ? await getSabreTokenV3() : await getSabreTokenV2();
  return cachedToken.accessToken;
}
