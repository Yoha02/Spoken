import { NextResponse } from "next/server";
import { extractTripDetails } from "@/lib/landingai";
import { appendTrace, updateTrip } from "@/lib/tripObject";

// Generic manual entry point: paste an email, a group-chat excerpt, or any
// other plain text describing the trip. This is what /api/import-email
// calls under the hood too — use this route when there's no Gmail message
// to fetch from (e.g. destination was shared in a group chat instead).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const text = body?.text;

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Missing 'text' in request body" }, { status: 400 });
  }

  const { fields, source } = await extractTripDetails(text);
  appendTrace({
    ts: Date.now(),
    server: "landingai",
    fn: "extractTripDetails",
    arg: text.slice(0, 60),
    ok: source === "landingai",
  });

  updateTrip(fields);

  return NextResponse.json({ fields, source });
}
