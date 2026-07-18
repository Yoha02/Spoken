import { NextResponse } from "next/server";

// Owner: agent/voice teammate. Fill in with the voice-agent orchestration
// logic (reads/writes the shared TripObject via core/tripObject.ts) — this
// is what "Start swarm" on the dashboard calls.
export async function startSwarm() {
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
