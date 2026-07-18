import { NextResponse } from "next/server";
import { getLatestTripEmail } from "@/lib/gmail";
import { extractTripDetails } from "@/lib/landingai";
import { appendTrace, updateTrip } from "@/lib/tripObject";

export async function POST() {
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

  updateTrip(fields);

  return NextResponse.json({ email: { subject: email.subject, from: email.from }, fields, source });
}
