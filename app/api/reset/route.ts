import { NextResponse } from "next/server";
import { getTrip, resetTripForRun } from "@/core/tripObject";

// Clears everything the previous demo run produced (legs, costs, payment
// split, action feed, call state) while keeping the traveler roster, and
// invalidates any in-flight preview timeline. Used by the dashboard's
// Extract button to guarantee a fresh run before Start swarm.
export async function POST() {
  resetTripForRun();
  const trip = getTrip();
  return NextResponse.json({
    ok: true,
    travelers: trip.travelers.map((t) => ({ id: t.id, name: t.name })),
  });
}
