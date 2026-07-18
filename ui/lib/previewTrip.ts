import type { Leg, TripObject } from "@/core/tripObject";

// Rehearsal-only snapshots. Nothing here is sent to the server or written
// to the real TripObject — it exists purely so the visual system (which
// phases depend on real legs/split data that today's agent/sabre/paypal
// stubs can't yet produce) can be previewed before those routes are built.
export type PreviewKey = "planning" | "booked" | "disrupted" | "rebooked" | "awaiting_payment" | "paid";

export const PREVIEW_KEYS: PreviewKey[] = [
  "planning",
  "booked",
  "disrupted",
  "rebooked",
  "awaiting_payment",
  "paid",
];

const ORIGINS = ["SFO", "SJC", "OAK", "LAX"];

function flightLeg(travelerId: string, status: "proposed" | "booked", priceBump = 0): Leg {
  return {
    type: "flight",
    travelerId,
    origin: "SFO",
    dest: "AUS",
    depart: "2026-08-14T09:00",
    arrive: "2026-08-14T12:00",
    carrier: "AA",
    price: 320 + priceBump,
    status,
  };
}

function hotelLeg(status: "proposed" | "booked"): Leg {
  return {
    type: "hotel",
    name: "Kimber Modern",
    checkIn: "2026-08-14",
    checkOut: "2026-08-17",
    rooms: 2,
    price: 640,
    status,
  };
}

function dinnerLeg(status: "calling" | "booked" | "failed", notes?: string): Leg {
  return { type: "dinner", place: "Uchi", time: "2026-08-15T19:30", partySize: 4, notes, status };
}

export function buildPreviewTrip(key: PreviewKey, base: TripObject): TripObject {
  const dest = base.dest || "Austin";
  const dateRange: [string, string] = base.dateRange[0] ? base.dateRange : ["2026-08-14", "2026-08-17"];
  const budgetPerPerson = base.budgetPerPerson || 800;

  const settledTravelers = base.travelers.map((t, i) => ({
    ...t,
    origin: t.origin || ORIGINS[i % ORIGINS.length],
    seat: t.seat || (i % 2 === 0 ? ("aisle" as const) : ("window" as const)),
    diet: t.diet || "none",
    callStatus: "done" as const,
    transcript: t.transcript.length ? t.transcript : ["Sounds good, thanks!"],
  }));

  const firstId = base.travelers[0]?.id ?? "ravi";

  switch (key) {
    case "planning":
      return {
        ...base,
        dest,
        dateRange,
        budgetPerPerson,
        travelers: base.travelers.map((t, i) => ({
          ...t,
          callStatus: i === 0 ? "live" : i === 1 ? "ringing" : "done",
          transcript:
            i === 0
              ? ["Hey! Yeah, Austin works great for me.", "I'll fly out of SJC if that's cheaper.", "Aisle seat, please."]
              : t.transcript,
        })),
        legs: [],
        totalCost: 0,
        split: undefined,
      };

    case "booked":
      return {
        ...base,
        dest,
        dateRange,
        budgetPerPerson,
        travelers: settledTravelers,
        legs: [flightLeg(firstId, "booked"), hotelLeg("booked"), dinnerLeg("booked")],
        totalCost: 320 * settledTravelers.length + 640,
        split: undefined,
      };

    case "disrupted":
      return {
        ...base,
        dest,
        dateRange,
        budgetPerPerson,
        travelers: settledTravelers,
        legs: [flightLeg(firstId, "booked"), hotelLeg("booked"), dinnerLeg("failed", "Closed — produce recall, avoiding raw-greens venues")],
        totalCost: 320 * settledTravelers.length + 640,
        split: undefined,
      };

    case "rebooked":
      return {
        ...base,
        dest,
        dateRange,
        budgetPerPerson,
        travelers: settledTravelers,
        legs: [flightLeg(firstId, "booked"), hotelLeg("booked"), dinnerLeg("booked")],
        totalCost: 320 * settledTravelers.length + 640 + 15,
        split: undefined,
      };

    case "awaiting_payment":
      return {
        ...base,
        dest,
        dateRange,
        budgetPerPerson,
        travelers: settledTravelers,
        legs: [flightLeg(firstId, "booked"), hotelLeg("booked"), dinnerLeg("booked")],
        totalCost: 1920,
        split: undefined,
      };

    case "paid":
      return {
        ...base,
        dest,
        dateRange,
        budgetPerPerson,
        travelers: settledTravelers,
        legs: [flightLeg(firstId, "booked"), hotelLeg("booked"), dinnerLeg("booked")],
        totalCost: 1920,
        split: settledTravelers.map((t) => ({ travelerId: t.id, amount: 480, paypalStatus: "paid" as const })),
      };
  }
}
