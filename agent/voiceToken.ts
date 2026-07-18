import { NextResponse } from "next/server";

// Owner: agent/voice teammate. Fill in with VocalBridge token minting
// (server-side only — never expose VOCALBRIDGE_API_KEY to the browser).
export async function mintVoiceToken() {
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
