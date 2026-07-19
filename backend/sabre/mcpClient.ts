// Client for Sabre's Skills MCP server (cert environment). Implements the
// MCP "Streamable HTTP" transport: JSON-RPC 2.0 messages over a single POST
// endpoint, with session continuity via Mcp-Session-Id (returned by the
// server after initialize) and Sabre's own required Conversation-Id header
// (format confirmed working by the team: V1@<session>@<transaction>@).
//
// This deliberately discovers tool schemas via tools/list rather than
// hardcoding guessed argument shapes for search-flights/search-hotels — see
// backend/sabre/mcpDiagnostic.ts.

const MCP_URL = process.env.SABRE_MCP_URL || "https://mcp2.cert.sabre.com/mcp";

export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type McpSession = {
  sessionId?: string;
  conversationId: string;
  nextId: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRpcResult = any;

function randomSegment(): string {
  return Math.random().toString(36).slice(2, 10);
}

function newConversationId(): string {
  return `V1@swarm-${randomSegment()}@txn-${randomSegment()}@`;
}

function authToken(): string {
  const token = process.env.SABRE_HACKATHON_TOKEN;
  if (!token) throw new Error("Missing SABRE_HACKATHON_TOKEN in .env.local");
  return token;
}

function baseHeaders(session: McpSession): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${authToken()}`,
    "Conversation-Id": session.conversationId,
  };
  if (session.sessionId) headers["Mcp-Session-Id"] = session.sessionId;
  return headers;
}

function parseBody(contentType: string, text: string): JsonRpcResult {
  if (contentType.includes("text/event-stream")) {
    // Streamable HTTP may respond to a single request with an SSE frame;
    // take the last "data: {...}" line as the JSON-RPC message.
    const dataLines = text
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .filter(Boolean);
    const last = dataLines[dataLines.length - 1];
    return last ? JSON.parse(last) : {};
  }
  return text ? JSON.parse(text) : {};
}

async function rpcRequest(
  session: McpSession,
  method: string,
  params?: Record<string, unknown>
): Promise<JsonRpcResult> {
  const id = session.nextId++;
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: baseHeaders(session),
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }),
  });

  const returnedSessionId = res.headers.get("mcp-session-id");
  if (returnedSessionId) session.sessionId = returnedSessionId;

  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`MCP ${method} failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const payload = parseBody(contentType, text);
  if (payload.error) {
    throw new Error(`MCP ${method} error: ${JSON.stringify(payload.error).slice(0, 500)}`);
  }
  return payload.result;
}

async function rpcNotify(session: McpSession, method: string, params?: Record<string, unknown>) {
  await fetch(MCP_URL, {
    method: "POST",
    headers: baseHeaders(session),
    body: JSON.stringify({ jsonrpc: "2.0", method, params: params ?? {} }),
  });
}

/** Performs the initialize handshake and returns a session for subsequent calls. */
export async function createMcpSession(): Promise<McpSession> {
  const session: McpSession = { conversationId: newConversationId(), nextId: 1 };

  await rpcRequest(session, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "swarm-mode", version: "0.1.0" },
  });

  await rpcNotify(session, "notifications/initialized");

  return session;
}

/** Discovers available tools and their real input schemas — no guessing. */
export async function listMcpTools(session: McpSession): Promise<McpTool[]> {
  const result = await rpcRequest(session, "tools/list");
  return (result?.tools as McpTool[]) ?? [];
}

export async function readMcpResource(session: McpSession, uri: string): Promise<JsonRpcResult> {
  return rpcRequest(session, "resources/read", { uri });
}

export async function callMcpTool(
  session: McpSession,
  name: string,
  args: Record<string, unknown>
): Promise<JsonRpcResult> {
  return rpcRequest(session, "tools/call", { name, arguments: args });
}
