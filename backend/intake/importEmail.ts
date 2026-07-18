import { NextResponse } from "next/server";
import { applyExtractionToTrip } from "@/backend/intake/applyExtraction";
import { getLatestTripEmail } from "@/backend/intake/gmail";
import { extractTripDetails } from "@/backend/intake/landingai";
import { appendTrace } from "@/core/tripObject";

export async function importEmail() {
  let email;
  try {
    email = await getLatestTripEmail();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gmail fetch failed";
    appendTrace({ ts: Date.now(), server: "gmail", fn: "getLatestTripEmail", arg: "", ok: false });
    return NextResponse.json({ error: message }, { status: 502 });
  }

  appendTrace({ ts: Date.now(), server: "gmail", fn: "getLatestTripEmail", arg: "", ok: !!email });

  if (!email) {
    return NextResponse.json({ error: "No matching trip email found" }, { status: 404 });
  }

  const { fields, source } = await extractTripDetails(`${email.subject}\n\n${email.body}`);
  appendTrace({
    ts: Date.now(),
    server: "landingai",
    fn: "extractTripDetails",
    arg: email.subject,
    ok: source === "landingai",
  });

  // Landing AI result → resolve employees → invoke Vocal Bridge tool
  const applied = await applyExtractionToTrip(fields, { autoSwarm: true });

  return NextResponse.json({
    email: { subject: email.subject, from: email.from },
    fields: applied.fields,
    source,
    travelers: applied.travelers.map((t) => ({ id: t.id, name: t.name, phone: t.phone })),
    unmatchedNames: applied.unmatchedNames,
    swarm: applied.swarm,
  });
}
