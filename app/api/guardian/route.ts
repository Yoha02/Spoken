import { NextResponse } from "next/server";
import { startTripGuardian } from "@/backend/sabre/guardian";

// Arms Trip Guardian (post-confirmation flight tracking + self-heal).
// Idempotent: re-arming an already-armed run is a no-op.
export async function POST() {
  const result = startTripGuardian();
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json(result);
}
