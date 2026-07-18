import { appendTrace, getTrip, updateTrip, type Leg } from "@/core/tripObject";

function moneyRound(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Demo booking when Sabre shop/book is not wired (or when Vocal Bridge is in
 * test mode and we need a full path through to PayPal).
 *
 * Builds booked flight + hotel + dinner legs from traveler prefs, sets
 * totalCost, and clears any prior payment split so PayPal can be re-tested.
 */
export function mockBookItinerary(reason = "test mode"): {
  ok: true;
  totalCost: number;
  legCount: number;
  reason: string;
} {
  const trip = getTrip();
  const dest = trip.dest || "AUS";
  const destCode = dest.length === 3 ? dest.toUpperCase() : "AUS";
  const checkIn = trip.dateRange?.[0] || "2026-08-14";
  const checkOut = trip.dateRange?.[1] || "2026-08-17";
  const departIso = `${checkIn}T09:00`;
  const arriveIso = `${checkIn}T14:30`;

  const doneTravelers = trip.travelers.filter(
    (t) => t.callStatus === "done" || t.origin || t.callStatus === "live"
  );
  const flyers = doneTravelers.length > 0 ? doneTravelers : trip.travelers;

  const flightPrice = 320;
  const hotelPrice = 640;
  const dinnerPrice = 180;

  const legs: Leg[] = [];

  for (const t of flyers) {
    const origin = (t.origin || "SFO").slice(0, 3).toUpperCase();
    legs.push({
      type: "flight",
      travelerId: t.id,
      origin,
      dest: destCode,
      depart: departIso,
      arrive: arriveIso,
      carrier: "AA",
      price: flightPrice,
      pnr: `SIM${t.id.slice(0, 3).toUpperCase()}`,
      status: "booked",
    });
  }

  legs.push({
    type: "hotel",
    name: "Kimber Modern",
    checkIn,
    checkOut,
    rooms: Math.max(1, Math.ceil(flyers.length / 2)),
    price: hotelPrice,
    status: "booked",
  });

  // Dinner the evening after check-in (simple date bump for demo display).
  const dinnerDate = (() => {
    const d = new Date(`${checkIn}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return `${checkIn}T19:30`;
    d.setUTCDate(d.getUTCDate() + 1);
    return `${d.toISOString().slice(0, 10)}T19:30`;
  })();

  legs.push({
    type: "dinner",
    place: "Uchi",
    time: dinnerDate,
    partySize: Math.max(flyers.length, trip.travelers.length),
    notes: "Reserved — demo booking",
    status: "booked",
  });

  // Prefer budget × headcount when HR set a budget; else sum leg prices.
  const fromLegs =
    flyers.length * flightPrice + hotelPrice + dinnerPrice;
  const fromBudget =
    trip.budgetPerPerson > 0
      ? trip.budgetPerPerson * Math.max(flyers.length, trip.travelers.length)
      : 0;
  const totalCost = moneyRound(fromBudget > 0 ? fromBudget : fromLegs);

  // Clear prior PayPal split so each iteration can re-approve.
  updateTrip({
    legs,
    totalCost,
    split: undefined,
  });

  appendTrace({
    ts: Date.now(),
    server: "sabre",
    fn: "mockBook",
    arg: `${legs.length} legs · $${totalCost} · ${reason}`,
    ok: true,
  });

  return { ok: true, totalCost, legCount: legs.length, reason };
}
