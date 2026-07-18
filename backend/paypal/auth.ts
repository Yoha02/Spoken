// PayPal OAuth2 client-credentials (sandbox by default).
// Docs: POST /v1/oauth2/token

export type PayPalMode = "sandbox" | "live";

const API_BASE: Record<PayPalMode, string> = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
};

export function paypalMode(): PayPalMode {
  const raw = (process.env.PAYPAL_MODE || "sandbox").toLowerCase();
  return raw === "live" ? "live" : "sandbox";
}

export function paypalApiBase(): string {
  return API_BASE[paypalMode()];
}

type TokenCache = { accessToken: string; expiresAt: number };
const globalForPayPal = globalThis as unknown as { __paypalToken?: TokenCache };

export async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Missing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET in .env.local");
  }

  const cached = globalForPayPal.__paypalToken;
  // Refresh 60s early.
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !body.access_token) {
    const detail = body.error_description || body.error || res.statusText;
    throw new Error(`PayPal OAuth failed (${res.status}): ${detail}`);
  }

  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 300;
  globalForPayPal.__paypalToken = {
    accessToken: body.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return body.access_token;
}

export async function paypalFetch<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${paypalApiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { detail: text };
  }

  if (!res.ok) {
    const message =
      (json.message as string) ||
      (json.error_description as string) ||
      (json.details as { description?: string }[] | undefined)?.[0]?.description ||
      (json.name as string) ||
      res.statusText;
    throw new Error(`PayPal ${path} failed (${res.status}): ${message}`);
  }

  return json as T;
}
