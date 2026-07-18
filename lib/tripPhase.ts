import type { Leg, TripObject } from "@/lib/tripObject";

export type TripPhase = "planning" | "booked" | "disrupted" | "rebooked" | "awaiting_payment" | "paid";

function isFailed(leg: Leg): boolean {
  return leg.status === "failed";
}

function isBooked(leg: Leg): boolean {
  return leg.status === "booked";
}

// Base (steady-state) phase, derived purely from existing TripObject
// fields — no new field added to the type. A disruption is any leg
// reporting "failed" (today only the dinner leg variant has a failure
// state in the union). Once every leg is booked, we go straight to
// "awaiting_payment" — there's no resting "booked" state, because "booked"
// and "rebooked" are both transient celebrations layered on top of this
// by useDisplayPhase, not steady states of their own.
export function computeTripPhase(trip: TripObject): TripPhase {
  if (trip.split && trip.split.length > 0) {
    return trip.split.every((s) => s.paypalStatus === "paid") ? "paid" : "awaiting_payment";
  }

  if (trip.legs.length > 0) {
    if (trip.legs.some(isFailed)) return "disrupted";
    if (trip.legs.every(isBooked)) return "awaiting_payment";
  }

  return "planning";
}

export const PHASE_LABEL: Record<TripPhase, string> = {
  planning: "Planning",
  booked: "Booked",
  disrupted: "Disrupted",
  rebooked: "Rebooked",
  awaiting_payment: "Awaiting payment",
  paid: "Paid",
};

// CSS variable names (see app/globals.css) — not resolved colors, so
// components can drop these straight into inline style or a Tailwind
// arbitrary value.
export const PHASE_COLOR_VAR: Record<TripPhase, string> = {
  planning: "var(--ice)",
  booked: "var(--success)",
  disrupted: "var(--signal)",
  rebooked: "var(--success)",
  awaiting_payment: "var(--amber)",
  paid: "var(--success)",
};
