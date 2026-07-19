import { NextResponse } from "next/server";
import { createMcpSession, listMcpTools } from "@/backend/sabre/mcpClient";
import { appendTrace } from "@/core/tripObject";

// Diagnostic route — connects to Sabre's cert MCP server, lists real tool
// schemas (search-flights, search-hotels, etc.) instead of guessing
// argument shapes. Read-only: initialize + tools/list only, no bookings.
export async function checkMcpTools() {
  try {
    const session = await createMcpSession();
    const tools = await listMcpTools(session);
    appendTrace({
      ts: Date.now(),
      server: "sabre-mcp",
      fn: "tools/list",
      arg: `${tools.length} tools`,
      ok: true,
    });
    return NextResponse.json({
      ok: true,
      sessionId: session.sessionId,
      toolCount: tools.length,
      tools,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "MCP diagnostic failed";
    appendTrace({ ts: Date.now(), server: "sabre-mcp", fn: "tools/list", arg: message.slice(0, 120), ok: false });
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
