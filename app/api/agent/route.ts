import { NextResponse } from "next/server";

// Owner: fill in with the voice-agent orchestration logic (reads/writes the
// shared TripObject via lib/tripObject.ts).
export async function POST() {
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
