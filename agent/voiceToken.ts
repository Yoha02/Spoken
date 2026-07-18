import { NextResponse } from "next/server";
import { mintToken } from "@/agent/vocalbridge/client";

// Owner: agent/voice teammate. Mints a short-lived Vocal Bridge connection
// token (server-side only — never expose VOCALBRIDGE_API_KEY to the browser).
export async function mintVoiceToken(req: Request) {
  try {
    let participantName = "Organizer";
    try {
      const body = await req.json();
      if (typeof body?.participant_name === "string") {
        participantName = body.participant_name;
      } else if (typeof body?.participantName === "string") {
        participantName = body.participantName;
      }
    } catch {
      // empty body is fine
    }

    const token = await mintToken(participantName);
    return NextResponse.json(token);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to mint voice token";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
