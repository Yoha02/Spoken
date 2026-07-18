import { NextResponse } from "next/server";
import { startVocalBridgeSwarm } from "@/agent/tools/startVocalBridgeSwarm";
import { applyDirectoryPhones } from "@/backend/intake/employeeDirectory";
import { vocalBridgeModeLabel } from "@/core/featureFlags";
import { getTrip, updateTrip } from "@/core/tripObject";

// "Start swarm" — places Vocal Bridge outbound calls (or simulates them when
// VOCALBRIDGE_CALLS_ENABLED=false) for every traveler on the TripObject.
export async function startSwarm() {
  const trip = getTrip();
  // Always re-apply EMPLOYEE_PHONE_* so seed / stale trip phones never dial.
  const withPhones = applyDirectoryPhones(trip.travelers);
  // Test mode (no real calls) can run without E.164 phones; live mode cannot.
  const travelers =
    vocalBridgeModeLabel() === "test"
      ? withPhones.filter((t) => t.name)
      : withPhones.filter((t) => t.phone);
  if (withPhones.length > 0) {
    updateTrip({ travelers: withPhones });
  }

  if (travelers.length === 0) {
    return NextResponse.json(
      {
        error:
          vocalBridgeModeLabel() === "live"
            ? "No travelers with phones — set EMPLOYEE_PHONE_* or switch Voice to TEST"
            : "No travelers on the trip — import a CEO email first",
      },
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
      mode: result.mode ?? vocalBridgeModeLabel(),
      calls: result.calls,
      travelerCount: travelers.length,
      booked: result.booked,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Swarm failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
