import { NextResponse } from "next/server";
import { applyExtractionToTrip } from "@/backend/intake/applyExtraction";
import { extractTripDetails } from "@/backend/intake/landingai";
import { appendTrace, resetTripForRun } from "@/core/tripObject";

// Generic manual entry point: paste a CEO→HR email, a group-chat excerpt, or any
// plain text describing who needs to travel. Same Landing AI → Vocal Bridge chain
// as importEmail (auto-swarm on by default; pass autoSwarm: false to skip calls).
export async function extractTrip(req: Request) {
  const body = await req.json().catch(() => null);
  const text = body?.text;
  const autoSwarm = body?.autoSwarm !== false;

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Missing 'text' in request body" }, { status: 400 });
  }

  // Every extract starts a fresh run — clears legs, split, feed, call state.
  resetTripForRun();

  const { fields, source } = await extractTripDetails(text);
  appendTrace({
    ts: Date.now(),
    server: "landingai",
    fn: "extractTripDetails",
    arg: text.slice(0, 60),
    ok: source === "landingai",
  });

  const applied = await applyExtractionToTrip(fields, { autoSwarm });

  return NextResponse.json({
    fields: applied.fields,
    source,
    travelers: applied.travelers.map((t) => ({ id: t.id, name: t.name, phone: t.phone })),
    unmatchedNames: applied.unmatchedNames,
    swarm: applied.swarm,
  });
}
