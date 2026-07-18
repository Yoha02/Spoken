// Low-level Vocal Bridge HTTP client (mirrors the official CLI: vb call / vb auth).
// Docs surface: https://vocalbridgeai.com — POST /api/v1/token, POST /api/v1/calls

const DEFAULT_API_URL = "https://vocalbridgeai.com";

export type PlaceCallInput = {
  phoneNumber: string; // E.164
  name?: string;
};

export type PlaceCallResult = {
  callId?: string;
  status?: string;
  roomName?: string;
  destination?: string;
  livekitUrl?: string;
  raw: Record<string, unknown>;
};

export type MintTokenResult = {
  url?: string;
  token?: string;
  room_name?: string;
  [key: string]: unknown;
};

function apiBase(): string {
  return (process.env.VOCALBRIDGE_API_URL || process.env.VOCAL_BRIDGE_API_URL || DEFAULT_API_URL).replace(
    /\/$/,
    ""
  );
}

function apiKey(): string {
  const key = process.env.VOCALBRIDGE_API_KEY || process.env.VOCAL_BRIDGE_API_KEY;
  if (!key) {
    throw new Error(
      "Missing VOCALBRIDGE_API_KEY (or VOCAL_BRIDGE_API_KEY) — set it in .env.local"
    );
  }
  return key;
}

function headers(): HeadersInit {
  const h: Record<string, string> = {
    "X-API-Key": apiKey(),
    "Content-Type": "application/json",
    "User-Agent": "Spoken/swarm-mode",
  };
  const agentId = process.env.VOCALBRIDGE_AGENT_ID || process.env.VOCAL_BRIDGE_AGENT_ID;
  if (agentId) h["X-Agent-Id"] = agentId;
  return h;
}

async function vbFetch(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers as Record<string, string> | undefined) },
  });

  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { detail: text };
  }

  if (!res.ok) {
    const detail = (body.detail as string) || (body.error as string) || res.statusText;
    throw new Error(`Vocal Bridge ${path} failed (${res.status}): ${detail}`);
  }
  return body;
}

/** Short-lived connection token (web / realtime). Never expose API key to the browser. */
export async function mintToken(participantName = "Organizer"): Promise<MintTokenResult> {
  return vbFetch("/api/v1/token", {
    method: "POST",
    body: JSON.stringify({ participant_name: participantName }),
  }) as Promise<MintTokenResult>;
}

/**
 * Place an outbound phone call through the configured agent.
 * Equivalent to: vb call +1… --name "…" --json
 */
export async function placeOutboundCall(input: PlaceCallInput): Promise<PlaceCallResult> {
  const phone = input.phoneNumber.trim();
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
    throw new Error(`Invalid E.164 phone number: ${phone}`);
  }

  const payload: Record<string, string> = { phone_number: phone };
  if (input.name) payload.participant_name = input.name;

  const raw = await vbFetch("/api/v1/calls", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return {
    callId: (raw.call_id as string) ?? (raw.id as string),
    status: raw.status as string | undefined,
    roomName: raw.room_name as string | undefined,
    destination: (raw.destination as string) ?? phone,
    livekitUrl: raw.livekit_url as string | undefined,
    raw,
  };
}

/** Fetch a call/session log (for transcript polling after outbound). */
export async function getCallLog(sessionId: string): Promise<Record<string, unknown>> {
  return vbFetch(`/api/v1/logs/${sessionId}`);
}
