import { NextResponse } from "next/server";

/**
 * Shared secret for external callers (Gmail add-on via Apps Script).
 * Expect header: X-Swarm-Secret: <GMAIL_TRIGGER_SECRET>
 * Also accepts Authorization: Bearer <secret>
 */
export function assertTriggerSecret(req: Request): NextResponse | null {
  const expected = process.env.GMAIL_TRIGGER_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      {
        error:
          "GMAIL_TRIGGER_SECRET is not configured on the server. Set it in .env.local.",
      },
      { status: 503 }
    );
  }

  const headerSecret = req.headers.get("x-swarm-secret")?.trim();
  const auth = req.headers.get("authorization")?.trim();
  const bearer =
    auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : undefined;
  const provided = headerSecret || bearer;

  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
