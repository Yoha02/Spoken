import {
  appendGuardianEvent,
  appendTrace,
  getRunGeneration,
  getTrip,
  setGuardianStatus,
  updateTrip,
} from "@/core/tripObject";
import { isPreviewFast } from "@/core/featureFlags";

function sleep(ms: number) {
  const scale = isPreviewFast() ? 0.02 : 1;
  return new Promise((r) => setTimeout(r, Math.max(10, Math.round(ms * scale))));
}

function trace(server: string, fn: string, arg: string, ok = true) {
  appendTrace({ ts: Date.now(), server, fn, arg, ok });
}

function event(kind: "ok" | "alert" | "heal" | "info", message: string) {
  appendGuardianEvent({ ts: Date.now(), kind, message });
}

/** Push every flight leg's arrival back to the delayed ETA. */
function applyArrivalDelay(newArriveLocal: string) {
  const legs = getTrip().legs.map((leg) =>
    leg.type === "flight"
      ? { ...leg, arrive: `${leg.arrive.slice(0, 10)}T${newArriveLocal}` }
      : leg
  );
  updateTrip({ legs });
}

/**
 * Trip Guardian: post-confirmation flight tracking + self-heal.
 *
 * Live mode would poll Sabre flight-status APIs in a background job after
 * wheels-up. In preview this is the same paced-timeline pattern as the call
 * swarm and booking: on-time milestones → mid-flight delay (wildfire smoke,
 * arrival +1h05m) → self-heal (Uber rescheduled, Vocal Bridge call to the
 * hotel, Sabre booking modified at $0 change) → status back to green.
 */
export function startTripGuardian(): { ok: boolean; started: boolean; reason?: string } {
  const trip = getTrip();

  if (trip.guardian) {
    // Already armed (or running) for this run — idempotent.
    return { ok: true, started: false, reason: "already armed" };
  }
  if (!trip.legs.some((l) => l.status === "booked")) {
    return { ok: false, started: false, reason: "Nothing booked yet — Guardian arms after confirmation" };
  }

  const runGen = getRunGeneration();
  const stale = () => getRunGeneration() !== runGen;

  setGuardianStatus("green");
  event("ok", "Guardian armed — monitoring all trip legs");
  trace("sabre", "subscribeFlightStatus", "AA · SFO → AUS · live tracking");

  void (async () => {
    try {
      await sleep(3500);
      if (stale()) return;
      event("ok", "Uber pickups completed — all travelers at SFO on time");
      trace("uber", "tripStatus", "3 pickups completed on time");

      await sleep(5000);
      if (stale()) return;
      event("ok", "AA · SFO → AUS departed on time — wheels up 9:09 AM");
      trace("sabre", "flightStatus", "SFO → AUS · departed on time");

      await sleep(7000);
      if (stale()) return;
      setGuardianStatus("red");
      event(
        "alert",
        "Mid-flight alert — wildfire smoke over Austin · arrival delayed to 3:40 PM (+1h 05m)"
      );
      trace("sabre", "flightAlert", "AUS arrival delayed 65 min — wildfire smoke", false);
      applyArrivalDelay("15:40");

      await sleep(3000);
      if (stale()) return;
      setGuardianStatus("healing");
      event("heal", "Self-heal engaged — adjusting ground transport and hotel");
      trace("spoken", "selfHeal", "rebooking ride + hotel for new ETA");

      await sleep(4000);
      if (stale()) return;
      event("heal", "Uber rescheduled — pickup moved to the 3:40 PM arrival · no fee");
      trace("uber", "reschedule", "airport pickup → 3:40 PM · $0 change");

      await sleep(3000);
      if (stale()) return;
      event("info", "Calling Kimber Modern — front desk");
      trace("vocalbridge", "placeOutboundCall", "Kimber Modern front desk");

      await sleep(6000);
      if (stale()) return;
      event("heal", "Hotel call — late arrival noted, rooms held for all guests");

      await sleep(5000);
      if (stale()) return;
      event("heal", "Late check-in confirmed — same rate · $0 change · no approval needed");
      trace("sabre", "modifyBooking", "Kimber Modern · late check-in · $0 change");

      await sleep(4000);
      if (stale()) return;
      event("info", "SMS sent — updated ETA shared with all travelers");
      trace("vocalbridge", "notifyTravelers", "new ETA 3:40 PM shared");

      await sleep(3000);
      if (stale()) return;
      setGuardianStatus("green");
      event("ok", "Trip healed — all travelers covered, itinerary back in sync");

      await sleep(2500);
      if (stale()) return;
      event("info", "All green again — continuing to monitor the remainder of the trip…");
    } catch (err) {
      trace(
        "sabre",
        "subscribeFlightStatus",
        err instanceof Error ? err.message.slice(0, 80) : "guardian run failed",
        false
      );
    }
  })();

  return { ok: true, started: true };
}
