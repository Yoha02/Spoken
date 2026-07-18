import { NextResponse } from "next/server";
import { startVocalBridgeSwarm } from "@/agent/tools/startVocalBridgeSwarm";
import { applyDirectoryPhones } from "@/backend/intake/employeeDirectory";
import { getTrip, updateTrip } from "@/core/tripObject";

// "Start swarm" — places Vocal Bridge outbound calls for every traveler
// currently on the TripObject (usually the three names Landing AI extracted).
export async function startSwarm() {
  const trip = getTrip();
  // Always re-apply EMPLOYEE_PHONE_* so seed / stale trip phones never dial.
  const travelers = applyDirectoryPhones(trip.travelers).filter((t) => t.phone);
  if (travelers.length > 0) {
    updateTrip({ travelers });
  }

  if (travelers.length === 0) {
    return NextResponse.json(
      { error: "No travelers on the trip — import a CEO email first" },
      { status: 400 }
    );
  }

  try {
    const result = await startVocalBridgeSwarm({
      dest: trip.dest || undefined,
      dateRange: trip.dateRange?.[0] ? trip.dateRange : undefined,
      purpose: `Collect origin airport, seat preference, and dietary restriction for trip to ${trip.dest || "destination"}`,
      travelers: travelers.map((t) => ({
        id: t.id,
        name: t.name,
        phone: t.phone,
      })),
    });

    return NextResponse.json({
      ok: result.ok,
      calls: result.calls,
      travelerCount: travelers.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Swarm failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
