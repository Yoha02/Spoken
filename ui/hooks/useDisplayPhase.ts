"use client";

import { useEffect, useRef, useState } from "react";
import type { Leg, TripObject } from "@/core/tripObject";
import { computeTripPhase, type TripPhase } from "@/ui/lib/tripPhase";

function legKey(leg: Leg, index: number): string {
  // Legs don't carry a stable id; type+index is stable identity as long as
  // routes update a leg in place rather than reordering the array.
  if (leg.type === "dinner") return `dinner-${index}-${leg.place}`;
  return `${leg.type}-${index}`;
}

const FLASH_MS = 2600;

// Single source of truth for "what phase is the UI in right now" — folds
// the steady-state derivation (computeTripPhase) together with two
// transient celebrations that aren't states so much as moments:
// "booked" (legs just all flipped to booked) and "rebooked" (a leg just
// flipped from failed back to booked in place). Both fall through to the
// real base phase once their flash window ends. Everything in the
// dashboard reads this one value.
export function useDisplayPhase(trip: TripObject | null): TripPhase {
  const prevLegStatuses = useRef<Map<string, string>>(new Map());
  const prevAllBooked = useRef(false);
  const [flash, setFlash] = useState<TripPhase | null>(null);

  const basePhase = trip ? computeTripPhase(trip) : "planning";

  useEffect(() => {
    if (!trip) return;

    const nextStatuses = new Map<string, string>();
    let rebooked = false;

    trip.legs.forEach((leg, i) => {
      const key = legKey(leg, i);
      const prevStatus = prevLegStatuses.current.get(key);
      if (prevStatus === "failed" && leg.status === "booked") rebooked = true;
      nextStatuses.set(key, leg.status);
    });
    prevLegStatuses.current = nextStatuses;

    const allBookedNow = trip.legs.length > 0 && trip.legs.every((l) => l.status === "booked");
    const justBooked = allBookedNow && !prevAllBooked.current;
    prevAllBooked.current = allBookedNow;

    const nextFlash: TripPhase | null = rebooked ? "rebooked" : justBooked ? "booked" : null;
    if (nextFlash) {
      setFlash(nextFlash);
      const timeout = setTimeout(() => setFlash(null), FLASH_MS);
      return () => clearTimeout(timeout);
    }
  }, [trip]);

  return flash ?? basePhase;
}
