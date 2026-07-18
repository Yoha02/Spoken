import { NextResponse } from "next/server";
import { applyExtractionToTrip } from "@/backend/intake/applyExtraction";
import { assertTriggerSecret } from "@/backend/intake/triggerSecret";
import { extractTripDetails } from "@/backend/intake/landingai";
import { appendTrace, resetTripForRun } from "@/core/tripObject";

/**
 * Gmail add-on entry point: HR clicks "Start travel swarm" on the open CEO email.
 * Apps Script sends subject/from/body; we run Landing AI → directory → Vocal Bridge.
 */
export async function triggerFromGmail(req: Request) {
  const denied = assertTriggerSecret(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const from = typeof body?.from === "string" ? body.from.trim() : "";
  const emailBody = typeof body?.body === "string" ? body.body : "";
  const messageId = typeof body?.messageId === "string" ? body.messageId : undefined;
  const autoSwarm = body?.autoSwarm !== false;

  const text = [subject, emailBody].filter(Boolean).join("\n\n").trim();
  if (!text) {
    return NextResponse.json(
      { error: "Missing email content (subject and/or body required)" },
      { status: 400 }
    );
  }

  // Each add-on trigger starts a fresh run — clears legs, split, feed, call state.
  resetTripForRun();

  appendTrace({
    ts: Date.now(),
    server: "gmail",
    fn: "triggerFromGmail",
    arg: subject || messageId || text.slice(0, 60),
    ok: true,
  });

  const { fields, source } = await extractTripDetails(text);
  appendTrace({
    ts: Date.now(),
    server: "landingai",
    fn: "extractTripDetails",
    arg: subject || text.slice(0, 60),
    ok: source === "landingai",
  });

  const applied = await applyExtractionToTrip(fields, { autoSwarm });

  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

  return NextResponse.json({
    ok: true,
    email: { subject, from, messageId },
    fields: applied.fields,
    source,
    travelers: applied.travelers.map((t) => ({ id: t.id, name: t.name, phone: t.phone })),
    unmatchedNames: applied.unmatchedNames,
    swarm: applied.swarm,
    links: {
      dashboard: appUrl,
      canvas: `${appUrl}/canvas`,
    },
  });
}
